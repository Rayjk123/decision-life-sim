"""Score a trained model question by question against any gold set (heuristic, d3, Haiku or Opus labels).

    python eval_unsloth.py <run_dir> <gold.jsonl> [<gold2.jsonl> ...]

For each gold file writes <run_dir>/eval-<gold-name>.json with:
  per question type: n, accuracy; for score questions also within-1 accuracy and mean absolute error in levels;
  move accuracy by archetype; and <run_dir>/pred-<gold-name>.jsonl with every prediction's full probabilities
  (for reliability diagrams and the write-up).
Gold rows: {id, archetype, state, questions, gold}; gold per question is a label or {"probabilities": {...}}.
"""
import json, sys, time, warnings
from pathlib import Path

warnings.filterwarnings("ignore")
from unsloth import FastDecisionModel  # noqa: E402


def gold_label(q, g):
    """The gold answer as the model's answer type: a choice key, a score position (int) or a bool."""
    if isinstance(g, dict) and "probabilities" in g:
        p = g["probabilities"]
        top = max(p, key=p.get)
        if q["type"] == "score":
            return int(top)
        if q["type"] == "noul":
            return top == "true"
        return top
    if q["type"] == "score":
        return int(g)
    return g


def main(run_dir, *gold_files):
    run_dir = Path(run_dir)
    model, tokenizer = FastDecisionModel.from_pretrained(str(run_dir / "model"), load_in_4bit=True)
    FastDecisionModel.for_inference(model)
    for gold_file in gold_files:
        rows = [json.loads(l) for l in Path(gold_file).read_text(encoding="utf-8").splitlines() if l.strip()]
        name = Path(gold_file).parent.name + "-" + Path(gold_file).stem
        stats, by_arch, preds = {}, {}, []
        t0 = time.time()
        for r in rows:
            answers = FastDecisionModel.predict(model, tokenizer, r["state"], r["questions"])
            rec = {"id": r["id"], "archetype": r.get("archetype"), "answers": {}}
            for qname, q in r["questions"].items():
                if qname not in r["gold"] or qname not in answers:
                    continue
                gold = gold_label(q, r["gold"][qname])
                a = answers[qname]
                pred = a.get("answer")
                if q["type"] == "score":
                    pred = int(pred) if pred is not None else -99
                ok = pred == gold
                s = stats.setdefault(qname, {"n": 0, "correct": 0, "within1": 0, "abs_err": 0.0})
                s["n"] += 1
                s["correct"] += int(ok)
                if q["type"] == "score":
                    s["within1"] += int(abs(pred - gold) <= 1)
                    s["abs_err"] += abs(pred - gold)
                if qname == "main":
                    b = by_arch.setdefault(r.get("archetype", "?"), [0, 0])
                    b[0] += int(ok); b[1] += 1
                rec["answers"][qname] = {"gold": gold, "pred": pred, "probabilities": a.get("probabilities")}
            preds.append(rec)
        summary = {}
        for qname, s in stats.items():
            summary[qname] = {"n": s["n"], "accuracy": s["correct"] / s["n"]}
            if s["within1"] or s["abs_err"]:
                summary[qname].update(within1=s["within1"] / s["n"], mae_levels=s["abs_err"] / s["n"])
        out = {"gold": gold_file, "rows": len(rows), "seconds": round(time.time() - t0, 1),
               "per_question": summary, "main_by_archetype": {k: {"accuracy": v[0] / v[1], "n": v[1]} for k, v in sorted(by_arch.items())}}
        (run_dir / f"eval-{name}.json").write_text(json.dumps(out, indent=1), encoding="utf-8")
        (run_dir / f"pred-{name}.jsonl").write_text("\n".join(json.dumps(p) for p in preds) + "\n", encoding="utf-8")
        line = " · ".join(f"{q} {v['accuracy']:.3f}" + (f" (±1 {v['within1']:.3f})" if 'within1' in v else "") for q, v in summary.items())
        print(f"EVAL {run_dir.name} on {name}: {line} [{out['seconds']}s, {len(rows)} rows]", flush=True)


if __name__ == "__main__":
    main(sys.argv[1], *sys.argv[2:])
