#!/usr/bin/env bash
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [[ -z "$ROOT" ]]; then
  echo "ERROR: run this inside the Agent Office Git repository." >&2
  exit 2
fi

PYTHON="$ROOT/backend/.venv/bin/python"
if [[ ! -x "$PYTHON" ]]; then
  echo "ERROR: backend/.venv is missing. Install the backend development environment first." >&2
  exit 2
fi

if ! command -v codex >/dev/null 2>&1; then
  echo "ERROR: Codex CLI is not available on PATH." >&2
  exit 2
fi

if ! codex login status >/dev/null 2>&1; then
  echo "ERROR: Codex CLI is not authenticated." >&2
  exit 2
fi

exec "$PYTHON" "$ROOT/scripts/phase6_codex_smoke.py"
