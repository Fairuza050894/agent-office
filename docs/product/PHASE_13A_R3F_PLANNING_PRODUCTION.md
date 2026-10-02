# Phase 13A — R3F Planning Production Migration

Status: ACCEPTED / READY FOR MERGE

## Goal

Promote the Phase 12 R3F renderer from a development-only comparison path to
the production renderer for the **Planning Office** only.

Phase 13A deliberately does not migrate Live or Replay.

## Production renderer split

```text
Planning Office (/office)
        |
        +-- R3F production renderer
        |      |
        |      +-- failure boundary -> current Three.js renderer
        |
Live / Replay (/runs/:runId/office)
        |
        +-- current Three.js renderer
```

The canonical product model is unchanged. The renderer remains a projection of
existing Task / Run / AgentRun / Event / Planning truth.

## Why this is safe to promote

Phase 12 completed deterministic A/B evidence using the same:

- Build floor;
- fully-rigged characters;
- Kenney furniture kit;
- camera presets;
- time/lighting profile;
- responsive viewport;
- selection and label presentation.

After fixing the legacy Three.js mobile frustum, Three.js and R3F reached exact
renderer parity on desktop and mobile.

## Phase 13A changes

- `@react-three/fiber` becomes a production dependency;
- normal Planning Office renders through R3F;
- the explicit development Diorama fixture can still select Three.js for A/B;
- Live/Replay remain on Three.js;
- an error boundary falls back from R3F to Three.js if the R3F React renderer
  fails to load or render;
- production build verification requires the R3F Planning renderer to exist and
  still rejects Diorama/pilot leakage;
- CI launches the built production app in Chromium and verifies that `/office`
  renders an R3F canvas with no development fixture markers;
- Planning empty Run/AgentRun inputs remain referentially stable.

## Failure model

R3F is not allowed to become a single point of failure for Planning.

```text
R3F lazy import / render
       |
       +-- success -> R3F Planning Office
       |
       +-- error   -> Three.js Planning fallback
```

The fallback does not alter product truth or backend state.

WebGL-unavailable environments still retain the HTML operational/planning
surface. R3F and Three.js both ultimately require WebGL for 3D rendering.

## Explicitly deferred

- Live renderer migration;
- Replay renderer migration;
- removal of the current Three.js renderer;
- Drei;
- post-processing;
- physics;
- Unity;
- visual redesign;
- operational Task Board / discipline / onboarding UX.

## Verification

Automated branch/PR gate:

```text
backend pytest + Ruff + format + MyPy
frontend tests + typecheck + lint + build
production Office bundle guard
Playwright production R3F Planning smoke
repository whitespace verification
```

The production smoke must prove:

```text
/office renders data-office-renderer="r3f"
R3F WebGL canvas has real dimensions
no development Diorama fixture marker is present
no page error occurs
```

Final merge is allowed only when all GitHub Actions jobs pass.

## Acceptance

Phase 13A is accepted when:

1. Planning uses R3F in production.
2. Live/Replay still use Three.js.
3. R3F failure has a tested Three.js fallback boundary.
4. production build contains verified furniture and the R3F renderer.
5. production bundle contains no debug/pilot fixture leakage.
6. production browser smoke passes.
7. canonical repository verification is green.
