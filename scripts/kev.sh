#!/usr/bin/env bash
# Start a local Kev decision server on macOS (Apple Silicon uses MLX automatically).
# Usage: ./scripts/kev.sh [model]   default model: jaredpalmer/kev-0.8b
# Needs: git, uv (https://docs.astral.sh/uv/), Python 3.12 or 3.13 (uv installs it if missing).
set -euo pipefail

MODEL="${1:-jaredpalmer/kev-0.8b}"
PORT="${KEV_PORT:-8009}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
KEV_DIR="$ROOT/.kev"

if ! command -v uv >/dev/null 2>&1; then
  echo "uv is not installed. Install it with:  curl -LsSf https://astral.sh/uv/install.sh | sh"
  exit 1
fi

if [ ! -d "$KEV_DIR/.git" ]; then
  echo "Cloning Kev into $KEV_DIR ..."
  git clone --depth 1 https://github.com/jaredpalmer/kev.git "$KEV_DIR"
fi

cd "$KEV_DIR"
echo "Syncing Kev's Python environment (first run downloads dependencies) ..."
uv sync --extra serve
echo "Starting $MODEL on http://127.0.0.1:$PORT (first run downloads the weights) ..."
exec uv run --extra serve python -m kev.serve --run "$MODEL" --port "$PORT"
