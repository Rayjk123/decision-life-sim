#!/usr/bin/env bash
# Merge per-batch label files into one file per source: data/labels/{claude,haiku,haiku-v1.1}.jsonl
set -euo pipefail
cd "$(dirname "$0")/data/labels"
for src in claude haiku haiku-v1.1; do
  [ -d "$src" ] || continue
  cat $(ls "$src"/batch-*.jsonl | grep -v rubric-v1) > "$src.jsonl"
  echo "$src: $(wc -l < "$src.jsonl") labels"
done
