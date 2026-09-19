#!/usr/bin/env bash
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [[ -z "$ROOT" ]]; then
  echo "ERROR: scripts/context.sh must run inside a Git working tree." >&2
  exit 2
fi

exec "$ROOT/.agents/skills/ao-context/scripts/context.sh" "$@"
