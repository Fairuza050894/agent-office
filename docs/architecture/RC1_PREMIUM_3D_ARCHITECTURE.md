# RC1 Premium 3D Architecture

Status: Active production RC1 architecture  
Date: 2026-10-03

## 1. Purpose

RC1 evolves Agent Office from a technically correct 3D projection into a
premium engineering-control-room product without moving workflow truth into the
renderer.

The Office remains a projection of canonical application state. Visual richness
may improve hierarchy, orientation, atmosphere, and character presence, but it
must never invent work, progress, tests, meetings, dialogue, KPI, or decisions.

## 2. Truth boundary

```text
Canonical application truth
Project / Task / Run / AgentRun / Event / Evidence / ResultReview
                         |
                         v
              runtimeProjection.ts
                         |
             +-----------+-----------+
             |                       |
             v                       v
       Living Office             Run Office
     planning/ambient          live / replay
             |                       |
             +-----------+-----------+
                         |
                         v
                  R3F production scene
                         |
             presentation-only layers
          environment / premium framing
          lighting / camera / characters
```

Presentation code may derive deterministic visual state from canonical inputs.
It may not write canonical domain state.

## 3. Renderer ownership

Production ownership:

```text
Planning -> R3F
Live     -> R3F
Replay   -> R3F
```

Recovery order:

```text
R3F production renderer
        -> Three.js recovery renderer
        -> HTML operational fallback
```

Three.js recovery remains intentionally conservative. New speculative RC1
visual capability belongs in R3F unless it is required to keep fallback
behavior functional.

See `ADR-0004-office-renderer-evolution.md` for fallback retirement criteria.

## 4. Scene composition

The active R3F scene is composed from independent concerns:

```text
R3FOfficeScene
  |- canonical environment geometry
  |    `office3d/environment.ts`
  |
  |- premium architecture layer
  |    `office3d/premiumEnvironment.ts`
  |
  |- furniture policy / production assets
  |    `office3d/furniturePolicy.ts`
  |    `office3d/officeFurnitureKit.ts`
  |
  |- character runtime
  |    `office3d/character.ts`
  |
  |- lighting policy
  |    `office3d/lighting.ts`
  |
  |- camera composition
       `office3d/camera.ts`
```

`R3FOfficeScene.tsx` is the renderer composition boundary. It owns WebGL/R3F
lifecycle and mounts presentation layers, but it does not become a workflow or
business-state owner.

## 5. Premium architecture layer

`premiumEnvironment.ts` is presentation-only and is active in the normal R3F
Planning / Live / Replay scene lifecycle.

It provides:

- perimeter structural framing;
- indirect emissive signal strips;
- a rear command-wall treatment;
- a suspended command beacon;
- floor-edge orientation accents;
- floor-specific architectural identity.

The layer has explicit metadata:

```text
presentationOnly = true
floor             = commons | build | strategy
identity          = social-hub | engineering-control-room | decision-studio
```

These values describe rendering intent only.

### Floor identity

```text
L1 Commons
  -> social / arrival hub
  -> warmer hospitality ribbons
  -> open visual framing

L2 Build
  -> engineering control room
  -> cool technical signal rails
  -> denser overhead/control framing

L3 Strategy
  -> decision studio
  -> symmetrical briefing architecture
  -> violet + warm presentation accents
```

No decorative signal bar is allowed to masquerade as live telemetry.

## 6. Room richness baseline

RC1 room richness deepens spatial identity without adding a second source of
business truth. The same presentation-only architecture layer establishes
recognizable sub-zones while keeping repeated geometry batched:

```text
Commons
  -> arrival/social zones at the room edges
  -> warmer lounge-like architectural masses

Build
  -> paired operations bays
  -> denser control-room framing around engineering work areas

Strategy
  -> central decision forum
  -> briefing-platform geometry with balanced sight lines
```

The zone geometry is deliberately abstract. It does not represent occupancy,
workload, progress, service health, KPI, meeting state, evidence, or dialogue.
It also remains outside canonical character navigation/collision truth.

Acceptance guards require every floor to expose its expected richness group
while retaining zero added `THREE.Light` objects, at least nine instanced mesh
groups, and no more than sixteen renderable meshes in the premium layer. This
keeps richer room identity within the established renderer-safe architecture
rather than solving visual quality by multiplying draw calls.

## 7. Performance architecture

Premium architecture uses `THREE.InstancedMesh` for repeated box geometry.
This is deliberate: adding dozens of independent decorative meshes would
consume the existing Diorama draw-call budget without adding product truth.

The established V2 reference ceiling remains a regression reference:

```text
Desktop: draw calls <= 276, triangles <= 33,304
Mobile:  draw calls <= 225, triangles <= 25,320
```

Those ceilings are not permission to fill the entire budget. RC1 should retain
headroom for character, selection, browser variance, and later adaptive-quality
work.

The premium layer therefore:

- batches repeated architecture by material;
- adds no `THREE.Light` objects;
- avoids per-frame animation for static architecture;
- remains outside the walkable/collision volume;
- is disposed with the normal environment lifecycle.

## 8. Lighting and materials

Lighting remains owned by `lighting.ts` plus established room-level environment
lights.

Premium architecture may use emissive materials for readable accents, but an
emissive material is not a new light source and cannot be used to imply
operational status.

RC1 lighting goals:

- strong dark-mode separation;
- readable character silhouettes;
- controlled warm/cool contrast;
- distinct morning/day/evening/night mood;
- no bloom-heavy or post-processing-first look;
- no effect that obscures status/nameplate legibility.

## 9. Camera composition

Camera policy is semantic rather than free-fly.

Users may inspect the Office through bounded overview/focus views. The camera
may follow selection/replay focus briefly, but camera motion must not become a
second navigation system or change AgentRun movement truth.

## 10. Character presentation boundary

Character presentation may improve:

- silhouette and role distinction;
- hover/selection legibility;
- nameplate hierarchy;
- animation blending and idle variety supported by verified clips;
- material treatment and grounded shadow/readability.

It may not:

- invent typing/testing/reviewing actions without canonical support;
- infer conversation text;
- fabricate meetings;
- rank people or agents by synthetic productivity;
- relabel ambient presence as factual execution.

The accepted RC1 character treatment is documented separately in
`RC1_CHARACTER_PRESENTATION.md`.

## 11. Quality and fallback roadmap

Remaining RC1 hardening includes:

1. Composer-first zero-friction interaction refinements;
2. Decision Inbox / Board / KPI / Dossier polish;
3. adaptive rendering quality based on measured capability;
4. deterministic visual-regression coverage;
5. desktop browser/device matrix and degraded-mode checks;
6. dependency hardening, including explicit renderer upgrade validation;
7. release packaging and rollback evidence.

Three.js fallback retirement is not part of this architecture slice.

## 12. Dependency rule

Renderer/toolchain dependency upgrades are isolated from product slices.
In particular, a Three.js upgrade must be validated on the latest RC1 state
with Planning, Live, Replay, screenshot, build, and renderer-smoke evidence.
Historical green CI from an older `main` is not sufficient.

## 13. Acceptance rule

A premium 3D slice is mergeable only when:

- exact PR head is confirmed;
- GitHub Actions runner actually starts;
- repository/backend/frontend verification steps actually execute;
- all required gates pass;
- renderer/performance regressions are investigated rather than bypassed;
- canonical truth and repository-safety boundaries remain unchanged.

Infrastructure failures with absent job steps/logs are retriable failures, not
successful verification.

## 14. Activation and room-richness evidence

Initial production activation:

```text
PR: #65
exact verified head: b39f6c4957b260b81ad1b8406badaa8101157ba8
GitHub Actions verify #1615: SUCCESS
merge commit: 544f593ca198c8dbe2b7cab703df17483b7c6ee5
post-merge main verify #1616: SUCCESS
```

Accepted premium room-richness evolution:

```text
superseded PR: #68 — closed without merge; no force-push
successor PR: #69
exact verified head: 8114de89033b70064d36c5a55c9550da186ef5b5
GitHub Actions verify #1623: SUCCESS
merge commit: f0f35c17b777f867866c41c480fbacb9bf810f4c
post-merge main verify #1624: SUCCESS
```

For #69, both the exact PR head and merged `main` used real hosted runners. The
repository whitespace gate, backend install/dependency consistency/pytest/Ruff/
format/MyPy, frontend install/dependency audit/tests/typecheck/lint/build,
production Office guard, Chromium installation, and production renderer split
smoke all executed and passed.

This evidence accepts Commons arrival/social zones, Build engineering operations
bays, Strategy decision-forum architecture, and richer command-wall/floor
orientation treatment as production presentation. The change does not create
new workflow, telemetry, KPI, occupancy, activity, collision, evidence, or
navigation truth; does not add light ownership; and does not retire the recovery
renderer or complete the later browser/device visual-regression and
adaptive-quality release gates.
