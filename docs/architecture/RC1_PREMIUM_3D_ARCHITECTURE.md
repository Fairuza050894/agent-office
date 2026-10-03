# RC1 Premium 3D Architecture

Status: Active production RC1 architecture with visual composition correction in progress  
Date: 2026-10-04

## 1. Purpose

RC1 evolves Agent Office from a technically correct 3D projection into a
premium engineering-control-room product without moving workflow truth into the
renderer.

The Office remains a projection of canonical application state. Visual richness
may improve hierarchy, orientation, atmosphere, and character presence, but it
must never invent work, progress, tests, meetings, dialogue, KPI, decisions,
telemetry, or evidence.

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

Three.js recovery remains intentionally conservative. New RC1 visual capability
belongs in R3F unless it is required to keep fallback behavior functional.

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

`premiumEnvironment.ts` is presentation-only and active in normal R3F Planning,
Live, and Replay rendering.

The architecture layer may provide:

- restrained perimeter posts/caps;
- a rear command-wall treatment;
- short floor-orientation accents;
- wall-adjacent floor-specific identity;
- batched decorative structure that improves spatial hierarchy.

The layer has explicit metadata:

```text
presentationOnly           = true
floor                      = commons | build | strategy
identity                   = social-hub | engineering-control-room | decision-studio
visualRevision             = composition-reset-v1
roomSpanningOverheadFrame  = false
```

These values describe rendering intent only.

## 6. Visual composition correction

### 6.1 Problem discovered after PR #69

PR #69 passed tests, build, renderer smoke, and post-merge CI. Manual production
visual inspection on 2026-10-04 nevertheless exposed an unacceptable composition
regression:

- long overhead beams crossed most of the room and read as a wireframe/debug
  cage;
- cyan/violet signal strips became the dominant object in the scene;
- a suspended command beacon competed with furniture and characters;
- overview cameras remained too far away for useful furniture/character
  readability;
- night lighting pushed the scene excessively warm/orange.

This is a process finding as well as a rendering finding: renderer health is not
visual-quality acceptance.

### 6.2 Corrected architectural rule

Premium structure must be **wall-adjacent, local, and subordinate** to the Office
itself.

Forbidden in normal production composition:

```text
room-spanning decorative roof grids
full-room neon rails
large suspended sci-fi ornaments
visual bars crossing primary sight lines
architecture whose primary read is "debug frame"
```

Preferred composition:

```text
short perimeter anchors
rear/side wall panels
localized integrated accent strips
furniture-led room identity
clear central sight lines
characters and work areas visually dominant over decoration
```

The visual reset introduces a regression guard: no repeated decorative box may
span more than 9 scene units horizontally. The Office is 20 x 14 units, so this
prevents a single decorative instance from silently bridging most of the room.

## 7. Floor identity

Floor identity must come from believable spatial composition, not giant colored
rails.

```text
L1 Commons / social hub
  -> warmer wall-adjacent hospitality treatment
  -> restrained side/rear panels
  -> existing lounge, pantry, game, quiet-room furniture remains primary

L2 Build / engineering control room
  -> compact side-wall operations panels
  -> cool technical accents integrated into the wall treatment
  -> engineering desks / QA / review / ops furniture remains primary

L3 Strategy / decision studio
  -> symmetrical wall-adjacent briefing panels
  -> restrained violet/warm accents
  -> planning/decision furniture remains primary
```

No decorative signal is allowed to masquerade as live telemetry, progress,
service health, occupancy, KPI, evidence, workload, or agent activity.

## 8. Performance architecture

Premium architecture uses `THREE.InstancedMesh` for repeated box geometry.
This prevents decorative richness from multiplying draw calls.

The established V2 reference ceiling remains a regression reference:

```text
Desktop: draw calls <= 276, triangles <= 33,304
Mobile:  draw calls <= 225, triangles <= 25,320
```

These ceilings are not targets to fill. RC1 must retain headroom for characters,
selection, browser variance, and adaptive-quality work.

The premium layer therefore:

- batches repeated architecture by material;
- adds no `THREE.Light` objects;
- avoids per-frame animation for static architecture;
- does not modify canonical collision/navigation truth;
- is disposed with the normal environment lifecycle;
- caps decorative horizontal span to prevent cage-like structures.

## 9. Lighting and materials

Lighting remains owned by `lighting.ts` plus established room-level environment
lights.

Premium architecture may use emissive materials for readable accents, but
emissive surfaces are not new light sources and cannot imply operational state.

RC1 lighting goals:

- strong dark-mode separation;
- readable character silhouettes;
- controlled warm/cool contrast;
- distinct morning/day/evening/night mood;
- restrained emissive intensity;
- no bloom-heavy or post-processing-first look;
- no effect that obscures furniture/status/nameplate legibility.

The composition-reset slice rebalances night lighting toward a cooler neutral
control-room key so the existing wood/furniture palette does not collapse into
an orange/brown wash.

## 10. Camera composition

Camera policy is semantic rather than free-fly.

Users inspect the Office through bounded overview/focus views. Camera movement
must not become a second navigation system or change AgentRun movement truth.

The visual reset tightens the overview envelope so characters and furniture are
readable without making the room feel cropped. Current target policy:

```text
zoom min distance: 7.5
zoom max distance: 18.5
overview preset distance: <= 18
```

Floor-specific overview/focus presets remain distinct.

## 11. Character presentation boundary

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

## 12. Visual acceptance workflow

A visual Office PR is no longer accepted solely because renderer smoke passes.

Required acceptance chain:

```text
exact PR head
  -> repository/backend/frontend tests
  -> typecheck/lint/build
  -> production Office guard
  -> Planning/Live/Replay renderer smoke
  -> office:shots capture matrix
  -> upload office-visual-acceptance artifact
  -> inspect screenshots for composition regressions
  -> merge only after both functional and visual acceptance
```

`office:shots` covers multiple floors, lighting windows, and desktop/mobile
viewports. The screenshot artifact is evidence for manual review; it does not
pretend to be an automated aesthetic score.

Future deterministic image-diff baselines belong to the dedicated visual
regression/browser-device hardening phase.

## 13. Dependency rule

Renderer/toolchain dependency upgrades are isolated from product slices.
A Three.js upgrade must be validated on the latest RC1 state with Planning,
Live, Replay, screenshots, build, renderer smoke, and visual review. Historical
green CI from an older `main` is not sufficient.

## 14. Acceptance rule

A premium 3D slice is mergeable only when:

- exact PR head is confirmed;
- GitHub Actions runner actually starts;
- repository/backend/frontend verification steps execute and pass;
- production renderer smoke executes and passes;
- screenshot artifact generation executes and the artifact is inspected;
- renderer/performance regressions are investigated rather than bypassed;
- canonical truth and repository-safety boundaries remain unchanged.

Infrastructure failures with absent job steps/logs are retriable failures, not
successful verification.

## 15. Historical activation evidence

Initial premium architecture activation:

```text
PR #65
head: b39f6c4957b260b81ad1b8406badaa8101157ba8
verify #1615: SUCCESS
merge: 544f593ca198c8dbe2b7cab703df17483b7c6ee5
post-merge verify #1616: SUCCESS
```

Room-richness functional evolution:

```text
superseded PR #68 — closed without merge; no force-push
successor PR #69
head: 8114de89033b70064d36c5a55c9550da186ef5b5
verify #1623: SUCCESS
merge: f0f35c17b777f867866c41c480fbacb9bf810f4c
post-merge verify #1624: SUCCESS
milestone sync #70 -> c00447a809fa020eef496786c481699bda5c194b
post-sync verify #1626: SUCCESS
```

Those runs remain valid evidence that the repository and renderer functioned.
They are **not** treated as proof that the resulting visual composition was
acceptable. The post-merge screenshot review supersedes that assumption and is
why the visual composition reset exists.

## 16. Remaining RC1 roadmap

After the composition reset is visually accepted:

1. Composer-first zero-friction interaction refinements;
2. Decision Inbox / Board / KPI / Dossier polish;
3. adaptive rendering quality based on measured capability;
4. deterministic visual-regression coverage;
5. desktop browser/device matrix and degraded-mode checks;
6. dependency hardening, including renderer upgrade validation;
7. RC1 release packaging and rollback evidence.

Three.js fallback retirement is not part of this corrective slice.
