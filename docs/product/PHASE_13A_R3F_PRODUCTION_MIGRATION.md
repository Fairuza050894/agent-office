# Phase 13A — R3F Production Renderer Migration

Status: IMPLEMENTING / AUTOMATED VERIFICATION PENDING

## Goal

Promote the Phase 12 React Three Fiber renderer from a deterministic pilot into
the default Agent Office renderer for all visible Office scopes:

```text
Planning
Live
Replay
```

without changing workflow truth or redesigning the Office UI.

## Production renderer contract

The default renderer is now:

```text
OfficeScene
  -> R3FOfficeScene
```

The legacy imperative renderer remains available as a bounded visual fallback:

```text
R3F lazy/render failure
  -> OfficeSceneRendererBoundary
  -> ThreeOfficeScene
```

The existing outer `OfficeRendererBoundary` remains the final presentation
boundary. Canonical operational pages remain usable even if both 3D renderers
are unavailable.

## Shared projection

Phase 13A introduces renderer-neutral projection/motion helpers:

```text
officeSceneMembers()
officeRuntimeStateTarget()
moveOfficeRuntime()
```

Both renderers consume the same member projection contract.

R3F now consumes the same canonical inputs as the legacy renderer:

- RunStage;
- AgentRun;
- AgentProfile;
- Planning OfficePresenceMember;
- selected AgentRun/member;
- Live/Replay mode;
- factual Replay range/start clock;
- floor;
- Office world time/mode;
- accepted furniture policy.

## Live behavior

R3F Live projects canonical AgentRun status into the existing factual Office
state machine and uses the existing station/path/facing rules.

No progress percentage, dialogue, review, testing, or work state is invented.

## Replay behavior

R3F Replay consumes `officeReplayPlan()` and the existing factual
`replayStartedAt` / `OfficeReplayRange` inputs.

Replay does not synthesize events or reconstruct missing timestamps.

## Failure behavior

Failure layers are intentionally bounded:

1. Kenney furniture failure keeps the primitive furniture fallback.
2. Character GLB failure keeps the local character fallback.
3. R3F lazy/render failure switches the visual renderer to Three.js.
4. Total 3D failure leaves canonical HTML operational surfaces available.

Renderer fallback never changes Run / AgentRun / Event truth.

## Dependency policy

`@react-three/fiber@9.8.1` moves from development-only to a production
dependency because the production Office now imports the R3F renderer.

No additional renderer libraries are introduced in Phase 13A:

- no Drei;
- no post-processing;
- no AO/Bloom/SMAA/Vignette;
- no physics;
- no Unity.

## Visual scope

Phase 13A is a renderer migration, not a redesign.

Expected user-visible result:

```text
same Office composition
same floor vocabulary
same accepted Build furniture
same lighting contract
same HTML operational UI
```

The migration is successful when renderer architecture changes without a
material visual regression.

## Acceptance

Required automated gate:

```bash
./scripts/verify.sh
```

Required frontend-specific gates:

```bash
npm test -- --run
npm run typecheck
npm run lint
npm run build
npm run office:debug:prod-check
```

Required migration tests:

- R3F is the production/default Office renderer.
- explicit Three control remains available to deterministic fixtures.
- R3F render/lazy failures have a Three.js fallback boundary.
- shared projection preserves canonical operational/workspace members.
- Planning, Live, and Replay page tests remain green.
- production bundle contains no Diorama debug/pilot truth.

## Explicitly deferred

- removal of the Three.js fallback;
- post-processing;
- visual redesign;
- new furniture rollout;
- Shift Ruler;
- operational Kanban / Task Evidence UX;
- Local Helper pairing;
- Engineering Discipline settings.

Those are separate checkpoints.
