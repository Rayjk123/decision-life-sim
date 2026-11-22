"""Print the Unsloth decision-model API (signatures + docstrings) installed on the desktop."""
import inspect, warnings
warnings.filterwarnings("ignore")
from unsloth import FastDecisionModel as F, DecisionTrainer as T

for name in ["from_pretrained", "get_peft_model", "build_dataset", "split_holdout", "calibrate", "evaluate", "predict", "rows_problem", "freeze_backbone"]:
    f = getattr(F, name)
    print(f"== {name}{inspect.signature(f)}")
    print((inspect.getdoc(f) or "(no doc)")[:700])
print(f"== DecisionTrainer{inspect.signature(T.__init__)}")
print((inspect.getdoc(T) or "(no doc)")[:1200])
