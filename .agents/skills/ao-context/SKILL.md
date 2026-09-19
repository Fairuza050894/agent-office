---
name: ao-context
description: Inspect the current Agent Office repository checkpoint before doing engineering work. Use this first when starting or resuming work.
---

# Agent Office Context

Use this skill before implementation, review, debugging, or milestone work.

## Procedure

1. Run the repo-root `scripts/context.sh` entry point (which delegates to this skill's script).
2. Read the resulting repository facts.
3. Read `../../../AGENTS.md`.
4. Read `../ao-milestone/references/current-phase.md`.
5. Read `../ao-repo-map/references/repo-map.md` and `../ao-repo-map/references/contract-index.md`.
6. Inspect task-relevant tests and source symbols.
7. Read only the specification sections needed for the current task.
8. Do not rescan the entire repository unless the task genuinely requires it.

## Required facts

Establish:

- current HEAD
- branch and upstream
- worktree cleanliness
- latest commits
- backend schema version if discoverable
- latest phase verification documents
- whether frontend has uncommitted changes

Do not infer repository state from conversation history when Git can answer it.
