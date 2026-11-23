"""Export a trained decision model for release: merged 16-bit weights (Hugging Face) and GGUF (llama.cpp /v1/systemone).

    python export_unsloth.py runs/<run> <out_dir> [q8_0 q4_k_m ...]

Writes <out_dir>/merged/ and <out_dir>/gguf/ (model-<QUANT>.gguf + export.json with the calibrated temperatures).
"""
import sys, time, json, warnings
from pathlib import Path

warnings.filterwarnings("ignore")
from unsloth import FastDecisionModel  # noqa: E402

run, out = Path(sys.argv[1]), Path(sys.argv[2])
quants = sys.argv[3:] or ["q8_0"]
t0 = time.time()
model, tokenizer = FastDecisionModel.from_pretrained(str(run / "model"), load_in_4bit=False)
model.save_pretrained_merged(str(out / "merged"), tokenizer)
print(f"merged → {out / 'merged'} ({time.time() - t0:.0f}s)", flush=True)
for q in quants:
    try:
        info = model.save_pretrained_gguf(str(out), tokenizer, quantization_method=q)
        print(f"gguf {q} → {json.dumps(info)[:300]} ({time.time() - t0:.0f}s)", flush=True)
    except Exception as e:  # k-quants need llama-quantize; q8_0 / f16 / bf16 only need the converter
        print(f"gguf {q} FAILED: {type(e).__name__}: {str(e)[:400]}", flush=True)
print("EXPORT DONE", flush=True)
