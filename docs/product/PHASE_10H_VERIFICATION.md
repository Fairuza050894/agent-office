## Phase 10H-A — Office Control Plane Simplification

This first visual slice applies the interaction hierarchy from the user-provided
Shift Ruler mockup to the real Agent Office Workspace without replacing the 3D
office or weakening canonical truth.

### Visual direction

- 3D Office remains the primary surface;
- command rail is flatter and quieter;
- Office-world stats become a compact inline strip instead of four cards;
- floor navigation remains visible but lighter;
- contextual rail is narrower, flatter, and less card-heavy;
- Universal Composer and work callouts use separators rather than nested cards;
- Operations Dock defaults collapsed in Workspace;
- a new bottom Shift ruler becomes the factual workday summary.

### Shift ruler truth boundary

The first implementation deliberately does **not** invent SDLC stage durations.

It uses:

- canonical Task records;
- canonical Run records;
- factual Run `started_at` / `completed_at` / current time;
- active AgentRun stage and status as the **current** state only.

Therefore a bar means factual Run lifetime inside the visible workday. The
current stage/status pill is not presented as historical stage duration.

A later slice may render stage-by-stage timing only after loading factual
`RunStage.started_at/completed_at` data.

### Scope safety

- Workspace-only visual changes are scoped under `office-control-plane-v2`;
- Run Office Live / Replay layout is not restyled by this slice;
- no Task / Run / AgentRun mutation is added;
- no fake history is generated;
- existing 10G living-office movement/collision behavior is unchanged.

### Verification

Fresh local verification is required:

```bash
cd ~/Projects/agent-office
./scripts/verify.sh
```

Rendered gate should check:

- 3D stage visually dominates;
- world status reads as one compact strip;
- right rail is materially quieter;
- Shift ruler is useful and not visually heavier than the office;
- Task with no Run is clearly distinct from active Run;
- WAITING/current stage is readable without implying fabricated history;
- responsive layout remains usable.
