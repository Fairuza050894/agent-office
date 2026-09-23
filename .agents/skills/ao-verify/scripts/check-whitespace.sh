#!/usr/bin/env bash

set -euo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"

if [[ -z "$ROOT" ]]; then
  echo "ERROR: whitespace verification must run inside a Git working tree." >&2
  exit 2
fi

cd "$ROOT"

failed=0

if ! git diff --check; then
  failed=1
fi

if ! git diff --cached --check; then
  failed=1
fi

while IFS= read -r -d '' path; do
  output="$(git diff --no-index --check -- /dev/null "$path" 2>&1 || true)"

  if [[ -n "$output" ]]; then
    printf '%s\n' "$output" >&2
    failed=1
  fi
done < <(git ls-files --others --exclude-standard -z)

if [[ "$failed" -ne 0 ]]; then
  exit 1
fi
