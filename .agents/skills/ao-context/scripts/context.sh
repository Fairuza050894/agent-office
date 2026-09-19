#!/usr/bin/env bash
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null)"
cd "$ROOT"

echo "=== AGENT OFFICE CONTEXT ==="

echo
echo "--- ROOT ---"
printf '%s\n' "$ROOT"

echo
echo "--- HEAD ---"
git log -1 --oneline

echo
echo "--- BRANCH ---"
git branch -vv

echo
echo "--- WORKTREE ---"
git status --short

echo
echo "--- FRONTEND WORKTREE ---"
git status --short frontend/ || true

echo
echo "--- RECENT COMMITS ---"
git log -8 --oneline

echo
echo "--- VERIFICATION DOCS ---"
find docs/product -maxdepth 1 -type f   \( -name 'PHASE_*_VERIFICATION.md' -o -name 'PHASE_*VERIFICATION.md' \)   -print 2>/dev/null | sort || true

echo
echo "--- SCHEMA VERSION REFERENCES ---"
grep -R   --exclude-dir=.venv   --exclude-dir=__pycache__   --exclude='*.pyc'   -nE 'LATEST_SCHEMA_VERSION|SCHEMA_VERSION'   backend/src/agent_office 2>/dev/null | head -20 || true

echo
echo "--- REMOTES ---"
git remote -v || true
