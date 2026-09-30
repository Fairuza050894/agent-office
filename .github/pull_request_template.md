## Scope

Describe the smallest intended change and the user-visible or operational reason.

## Truth / architecture boundary

Confirm which canonical truths are affected, if any.

- [ ] No fake Run / AgentRun / Event / Finding / Evidence state is introduced
- [ ] Workspace / Live / Replay boundaries remain explicit
- [ ] Git/workspace safety rules remain intact
- [ ] Any architecture-contract change is documented

## Verification evidence

Use the canonical full gate when the change spans the repository:

```bash
./scripts/verify.sh
```

Record exact commands and results below.

### Backend

- [ ] pytest
- [ ] Ruff check
- [ ] Ruff format check
- [ ] MyPy
- [ ] Not applicable (explain below)

### Frontend

- [ ] tests
- [ ] typecheck
- [ ] lint
- [ ] production build
- [ ] Not applicable (explain below)

### Repository

- [ ] `git diff --check`
- [ ] working tree reviewed with `git status --short`

### Rendered review

- [ ] Required and completed
- [ ] Not required (no rendered/UI behavior changed)

For 3D Office changes, review both normal and Maximize layouts and preserve the
verified Live / Historical Replay movement behavior.

## CI status

- [ ] GitHub Actions executed real steps and passed
- [ ] GitHub Actions is on runner/infrastructure hold; local verification evidence is recorded above

Do not describe a workflow with no assigned runner / `steps: null` as either
code-failed or green.

## Merge

- [ ] Branch is up to date with base
- [ ] No unresolved conflicts
- [ ] Human review complete
- [ ] Merge remains manual
