"""Find how DecisionTrainer's losses and gold labels work (kl_weight, soft labels, ordinal, brier, permute)."""
import inspect, re, warnings
warnings.filterwarnings("ignore")
from unsloth import DecisionTrainer, FastDecisionModel
src_files = {inspect.getsourcefile(DecisionTrainer), inspect.getsourcefile(FastDecisionModel)}
for path in sorted(src_files):
    print("#### FILE", path)
    text = open(path, encoding="utf-8").read()
    for kw in ["kl_weight", "soft", "gold", "ordinal_weight", "brier_weight", "permute_fields", "label_smoothing", "temperature", "def compute_loss", "probabilities"]:
        hits = [m.start() for m in re.finditer(kw, text)]
        print(f"--- {kw}: {len(hits)} hits")
        for h in hits[:3]:
            line_start = text.rfind("\n", 0, h) + 1
            print("   ", text[line_start:text.find("\n", h)].strip()[:200])
