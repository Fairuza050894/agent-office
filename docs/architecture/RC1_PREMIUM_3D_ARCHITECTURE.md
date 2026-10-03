# RC1 Premium 3D Architecture

Status: Active RC1 architecture  
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

`premiumEnvironment.ts` is presentation-only.

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

## 6. Performance architecture

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

## 7. Lighting and materials

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

## 8. Camera composition

Camera policy is semantic rather than free-fly.

Users may inspect the Office through bounded overview/focus views. The camera
may follow selection/replay focus briefly, but camera motion must not become a
second navigation system or change AgentRun movement truth.

## 9. Character presentation boundary

Character work in later RC1 slices may improve:

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

## 10. Quality and fallback roadmap

Remaining RC1 hardening includes:

1. richer verified character/environment presentation;
2. Composer-first zero-friction interaction refinements;
3. Decision Inbox / Board / KPI / Dossier polish;
4. adaptive rendering quality based on measured capability;
5. deterministic visual-regression coverage;
6. desktop browser/device matrix and degraded-mode checks;
7. dependency hardening, including explicit renderer upgrade validation;
8. release packaging and rollback evidence.

Three.js fallback retirement is not part of this architecture slice.

## 11. Dependency rule

Renderer/toolchain dependency upgrades are isolated from product slices.
In particular, a Three.js upgrade must be validated on the latest RC1 state
with Planning, Live, Replay, screenshot, build, and renderer-smoke evidence.
Historical green CI from an older `main` is not sufficient.

## 12. Acceptance rule

A premium 3D slice is mergeable only when:

- exact PR head is confirmed;
- GitHub Actions runner actually starts;
- repository/backend/frontend verification steps actually execute;
- all required gates pass;
- renderer/performance regressions are investigated rather than bypassed;
- canonical truth and repository-safety boundaries remain unchanged.

Infrastructure failures with absent job steps/logs are retriable failures, not
successful verification.
