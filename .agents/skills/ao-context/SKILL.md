---
name: ao-context
description: Inspect the current Agent Office repository checkpoint before doing engineering work. Use this first when starting or resuming work.
---

# Agent Office Context

Use this skill before implementation, review, debugging, or milestone work.

## Procedure

1. Run `scripts/context.sh`.
2. Read the resulting repository facts.
3. Read `../../../AGENTS.md`.
4. Read only the specification/documentation needed for the current task.
5. Do not rescan the entire repository unless the task genuinely requires it.

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
