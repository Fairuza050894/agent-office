---
name: ao-review
description: Review Agent Office changes for correctness, architectural consistency, security, state truth, and regression risk before commit.
---

# Agent Office Change Review

Review before recommending a commit.

## Inspect

1. `git diff --stat`
2. `git diff`
3. new and changed tests
4. persistence migration changes
5. contract/spec changes
6. API DTO exposure
7. event/audit behavior
8. ownership boundaries
9. restart behavior
10. security-negative behavior

## High-priority defect classes

Look specifically for:

- false state claims
- terminal-state regression
- duplicate effects
- stale Evidence
- unsafe workspace selection
- cross-Project leakage
- absolute path leakage
- secret leakage
- executor self-approval
- destructive Git
- implicit fallback executor selection
- `shell=True`
- arbitrary command/cwd APIs
- migration mutation of previously committed schema versions
- main-working-tree mutation
- fabricated tests/review/Evidence
- cleanup of uncertain external state

## Output

Prefer a compact report:

- BLOCKER
- IMPORTANT
- MINOR
- verification status
- commit recommendation

Do not fix unrelated issues while reviewing unless explicitly asked.
