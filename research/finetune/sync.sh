#!/usr/bin/env bash
# Sync the fine-tuning workspace with the desktop trainer (Windows, OpenSSH, C:\Users\User\dls-ft).
#   research/finetune/sync.sh push <set-name>...   copy datasets + desktop scripts up
#   research/finetune/sync.sh push-run <run-name>  copy a run's config up
#   research/finetune/sync.sh pull-run <run-name>  copy a run's metrics.json + logs back (not the model weights)
set -euo pipefail
HOST="${DLS_TRAINER:-user@192.168.50.162}"
REMOTE="C:/Users/User/dls-ft"
cd "$(dirname "$0")"
case "${1:-}" in
  push)
    shift
    scp -q desktop/*.py "$HOST:$REMOTE/"
    for s in "$@"; do
      ssh -o BatchMode=yes "$HOST" "if not exist $(echo "$REMOTE/data/sets/$s" | tr / '\\') mkdir $(echo "$REMOTE/data/sets/$s" | tr / '\\')" >/dev/null
      scp -q data/sets/"$s"/*.jsonl "$HOST:$REMOTE/data/sets/$s/"
    done ;;
  push-run)
    ssh -o BatchMode=yes "$HOST" "if not exist $(echo "$REMOTE/runs/$2" | tr / '\\') mkdir $(echo "$REMOTE/runs/$2" | tr / '\\')" >/dev/null
    scp -q runs/"$2"/config.json "$HOST:$REMOTE/runs/$2/" ;;
  pull-run)
    mkdir -p runs/"$2"
    scp -q "$HOST:$REMOTE/runs/$2/metrics.json" runs/"$2"/ 2>/dev/null || echo "no metrics yet"
    scp -q "$HOST:$REMOTE/runs/$2/train.log" runs/"$2"/ 2>/dev/null || true
    scp -q "$HOST:$REMOTE/runs/$2/eval*" runs/"$2"/ 2>/dev/null || echo "no eval yet"
    scp -q "$HOST:$REMOTE/runs/$2/pred-*" runs/"$2"/ 2>/dev/null || true ;;
  *) echo "usage: sync.sh push <set>... | push-run <run> | pull-run <run>"; exit 1 ;;
esac
