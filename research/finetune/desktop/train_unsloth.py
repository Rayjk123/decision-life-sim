"""Train one Unsloth decision model from a JSON config and record everything the write-up needs.

    python train_unsloth.py runs/<name>/config.json

Config keys (defaults in DEFAULTS): base, train/val/test (jsonl of {state, questions, gold}), max_seq_length,
load_in_4bit, r, lora_alpha, lr, head_lr, epochs or max_steps, batch, grad_accum, warmup_steps, label_smoothing,
brier_weight, ordinal_weight, kl_weight, permute_fields, seed, eval_every.
Writes next to the config: metrics.json (history, before/after-calibration metrics per question type, timing,
peak VRAM), train.log, and model/ (LoRA adapters + head, loadable by serve_unsloth.py).
"""
import json, math, sys, time, warnings
from pathlib import Path

warnings.filterwarnings("ignore")
from unsloth import FastDecisionModel, DecisionTrainer, is_bfloat16_supported  # noqa: E402
import torch  # noqa: E402
from transformers import TrainingArguments, TrainerCallback  # noqa: E402

DEFAULTS = dict(
    base="unsloth/Qwen3.5-0.8B", max_seq_length=1024, load_in_4bit=True, r=16, lora_alpha=16,
    lr=2e-4, head_lr=None, epochs=2, max_steps=-1, batch=2, grad_accum=4, warmup_steps=10,
    label_smoothing=0.0, brier_weight=0.0, ordinal_weight=0.0, kl_weight=0.0, permute_fields=False,
    seed=3407, eval_every=50,
)
QTYPE_NAMES = {0: "choice", 1: "score", 2: "noul"}


def read_jsonl(path):
    return [json.loads(line) for line in Path(path).read_text(encoding="utf-8").splitlines() if line.strip()]


def by_qtype(items):
    groups = {}
    for item in items:
        q = item.get("qtype", item.get("qtypes", [None])[0] if item.get("qtypes") else None)
        groups.setdefault(QTYPE_NAMES.get(q, str(q)), []).append(item)
    return groups


class History(TrainerCallback):
    def __init__(self):
        self.rows = []

    def on_log(self, args, state, control, logs=None, **kw):
        if logs:
            self.rows.append({"step": state.global_step, "epoch": state.epoch, **{k: v for k, v in logs.items() if isinstance(v, (int, float))}})


def main(config_path):
    config_path = Path(config_path)
    out = config_path.parent
    cfg = {**DEFAULTS, **json.loads(config_path.read_text(encoding="utf-8"))}
    t0 = time.time()
    torch.cuda.reset_peak_memory_stats()

    model, tokenizer = FastDecisionModel.from_pretrained(cfg["base"], max_seq_length=cfg["max_seq_length"], load_in_4bit=cfg["load_in_4bit"], random_state=cfg["seed"])
    model = FastDecisionModel.get_peft_model(model, r=cfg["r"], lora_alpha=cfg["lora_alpha"], lora_dropout=0.0, random_state=cfg["seed"])
    t_load = time.time() - t0

    sets = {}
    for split in ("train", "val", "test"):
        items, report = FastDecisionModel.build_dataset(read_jsonl(cfg[split]), tokenizer, model)
        sets[split] = items
        print(f"{split}: {len(items)} items, report {report}", flush=True)

    history = History()
    args = TrainingArguments(
        output_dir=str(out / "checkpoints"), per_device_train_batch_size=cfg["batch"], gradient_accumulation_steps=cfg["grad_accum"],
        warmup_steps=cfg["warmup_steps"], num_train_epochs=cfg["epochs"], max_steps=cfg["max_steps"], learning_rate=cfg["lr"],
        lr_scheduler_type="cosine", weight_decay=0.01, bf16=is_bfloat16_supported(), fp16=not is_bfloat16_supported(),
        logging_steps=5, eval_strategy="steps", eval_steps=cfg["eval_every"], save_strategy="no", seed=cfg["seed"], report_to="none",
    )
    trainer = DecisionTrainer(
        model=model, args=args, tokenizer=tokenizer, train_dataset=sets["train"], eval_dataset=sets["val"][:400],
        head_learning_rate=cfg["head_lr"], label_smoothing=cfg["label_smoothing"], brier_weight=cfg["brier_weight"],
        ordinal_weight=cfg["ordinal_weight"], kl_weight=cfg["kl_weight"], permute_fields=cfg["permute_fields"], callbacks=[history],
    )
    t1 = time.time()
    trainer.train()
    t_train = time.time() - t1

    FastDecisionModel.for_inference(model)
    def evaluate(items):
        result = {"all": FastDecisionModel.evaluate(model, tokenizer, items)}
        for name, group in by_qtype(items).items():
            result[name] = {**FastDecisionModel.evaluate(model, tokenizer, group), "n": len(group)}
        return result

    before = {"val": evaluate(sets["val"]), "test": evaluate(sets["test"])}
    calibration = FastDecisionModel.calibrate(model, tokenizer, sets["val"])
    after = {"test": evaluate(sets["test"])}
    model.save_pretrained(str(out / "model"))
    tokenizer.save_pretrained(str(out / "model"))

    metrics = {
        "config": cfg, "items": {k: len(v) for k, v in sets.items()},
        "seconds": {"load": round(t_load, 1), "train": round(t_train, 1), "total": round(time.time() - t0, 1)},
        "peak_vram_gb": round(torch.cuda.max_memory_allocated() / 1e9, 2),
        "history": history.rows, "before_calibration": before, "calibration": calibration, "after_calibration": after,
        "temperatures": getattr(model, "decision_config", {}).get("temperature"),
    }
    (out / "metrics.json").write_text(json.dumps(metrics, indent=1, default=str), encoding="utf-8")
    a = after["test"]["all"]
    print(f"DONE {out.name}: test accuracy {a['accuracy']:.3f}, record {a['record_accuracy']:.3f}, ece {a['ece']:.3f}, "
          f"train {t_train/60:.1f} min, peak VRAM {metrics['peak_vram_gb']} GB", flush=True)


if __name__ == "__main__":
    main(sys.argv[1])
