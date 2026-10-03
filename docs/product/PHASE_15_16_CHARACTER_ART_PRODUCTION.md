# Phase 15–16 — Character & Art Production Hardening

## Status

Implementation checkpoint after Phase 14 visual evolution.

## Product intent

Make the Office character layer dependable enough for a commercial technical beta without pretending that third-party assets are custom-authored art.

## Delivered

### Canonical role identity coverage

The Living Office core team is treated as a production contract:

- Product Manager
- System Analyst
- Principal Engineer
- Product Designer
- Backend Engineer
- Frontend Engineer
- QA Engineer
- Security Reviewer
- Technical Writer

Every core role must resolve to a deterministic, unique character appearance id and accent. Existing execution-era role keys remain deterministic for backward compatibility.

### Character asset production guard

`frontend/scripts/check-office-character-production.mjs` is now executed by development/build/render preparation.

It verifies:

- all five production rigged GLBs exist;
- each binary is a valid GLB container and has plausible size;
- each contains the required `Idle`, `Walk`, and `Run` clips;
- the asset bootstrap remains pinned to an upstream repository + exact commit;
- integrity metadata remains present;
- all nine Living Office core roles remain present in both the semantic roster and role appearance mapping;
- character appearance ids remain unique.

This turns the character asset contract into a repeatable build gate instead of a visual assumption.

### Animation policy

The current binaries continue to use their verified native rig and guaranteed Idle/Walk/Run clips. Behavior-specific candidates in the runtime may gracefully fall back to Idle.

The previously audited Quaternius animation library is **not** force-retargeted. Its skeleton is incompatible with the current character rig, and shipping a runtime retargeting hack would create deformation and maintenance risk.

### Art provenance

Current character binaries remain correctly attributed as integrity-pinned third-party assets. They are not relabeled as Blender-authored Agent Office originals.

A future custom `.blend -> .glb` pack can replace these assets behind the same variant/runtime contract without changing Task, Run, AgentRun, Composer, KPI, or workflow truth.

## Acceptance gates

```text
backend pytest / Ruff / format / MyPy
frontend tests / typecheck / lint / build
Office character production guard
repository whitespace verification
production Office guard
Chromium Planning / Live / Replay R3F smoke
```

## Decision

For the sellable technical-beta path, bespoke Blender art is an enhancement rather than a blocker for Phase 17–19. Reliability, orchestration, KPI truth, and zero-friction product flow have higher product value than replacing already-verified character binaries today.
