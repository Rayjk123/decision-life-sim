#!/usr/bin/env bash
# Assemble the public release folder for E07m: the model card, the training data (medieval wording), the rubric,
# and (copied in separately) the exported model files.
#   research/finetune/release/build-release.sh <out-dir>
set -euo pipefail
cd "$(dirname "$0")/../../.."
OUT="${1:?usage: build-release.sh <out-dir>}"
mkdir -p "$OUT/data"
cp research/finetune/release/MODEL_CARD.md "$OUT/README.md"
cp research/finetune/release/DATASET_CARD.md "$OUT/data/README.md"
cp research/finetune/data/sets/haiku-deals-med/train.jsonl "$OUT/data/train.jsonl"
cp research/finetune/data/sets/haiku-deals-med/val.jsonl "$OUT/data/val.jsonl"
cp research/finetune/data/sets/claude-hard-med/test.jsonl "$OUT/data/test.jsonl"
cp docs/finetune/labeling-rubric.md "$OUT/data/labeling-rubric.md"
cp research/finetune/configs/e07m-deals-4b-medieval.json "$OUT/training-config.json"
wc -l "$OUT"/data/*.jsonl
