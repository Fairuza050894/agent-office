---
name: ao-safe-edit
description: Apply Agent Office repository changes without destructive Git operations or unintended scope expansion.
---

# Agent Office Safe Editing

These rules apply to implementation and repair work.

## Never perform

- `git reset`
- `git reset --hard`
- `git clean`
- `git restore .`
- destructive checkout
- stashing user changes
- force push
- rewriting committed history
- automatic merge to Project main
- arbitrary recursive deletion

Do not commit or push unless the user explicitly authorizes the checkpoint.

## Before editing

1. Confirm current HEAD.
2. Confirm `git status --short`.
3. Stop if unrelated WIP exists.
4. Identify the smallest files that own the behavior.
5. Read existing tests before designing new behavior.

## While editing

- Keep provider-specific behavior outside the provider-neutral core.
- Preserve durable history.
- Preserve Project/Run/AgentRun/Workspace ownership.
- Unknown state must remain unknown.
- Never invent successful execution, test, review, cancellation, or Evidence.
- Never expose absolute host paths through normal DTOs.
- Treat the Project main working tree as protected.

## After editing

Run the relevant focused tests first, then `$ao-verify`.

Do not automatically commit.
