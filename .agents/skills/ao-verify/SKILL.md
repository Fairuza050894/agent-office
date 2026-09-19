---
name: ao-verify
description: Run the canonical Agent Office backend, frontend, Git hygiene, and regression verification gates.
---

# Agent Office Verification

Use `scripts/verify.sh` after implementation or repair.

The script runs:

Backend:
- pytest
- Ruff
- Ruff format check
- mypy

Frontend:
- tests
- typecheck
- lint
- build

Repository:
- git diff --check
- frontend worktree status
- full worktree status

A green command is evidence only for the command actually executed.

Do not claim browser verification, real executor verification, or other checks that the script does not perform.
