#!/usr/bin/env bash
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null)"

echo "=== AGENT OFFICE VERIFICATION ==="

echo
echo "=== BACKEND: PYTEST ==="
cd "$ROOT/backend"
.venv/bin/python -m pytest -q

echo
echo "=== BACKEND: RUFF ==="
.venv/bin/ruff check .

echo
echo "=== BACKEND: FORMAT ==="
.venv/bin/ruff format --check .

echo
echo "=== BACKEND: MYPY ==="
.venv/bin/mypy src

echo
echo "=== FRONTEND: TEST ==="
cd "$ROOT/frontend"
npm test

echo
echo "=== FRONTEND: TYPECHECK ==="
npm run typecheck

echo
echo "=== FRONTEND: LINT ==="
npm run lint

echo
echo "=== FRONTEND: BUILD ==="
npm run build

echo
echo "=== REPOSITORY: DIFF CHECK ==="
cd "$ROOT"
git diff --check

echo
echo "=== FRONTEND STATUS ==="
git status --short frontend/

echo
echo "=== FULL STATUS ==="
git status --short

echo
echo "=== VERIFICATION COMPLETE ==="
