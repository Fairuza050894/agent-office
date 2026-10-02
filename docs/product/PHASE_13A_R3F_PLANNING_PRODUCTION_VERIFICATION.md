# Phase 13A — R3F Planning Production Verification

Status: ACCEPTED

## Decision

```text
GO — Planning Office uses R3F in production.
```

Live and Replay remain on the existing Three.js renderer.

## Exact verification evidence

Automated verification run:

```text
GitHub Actions verify #1368
head: d1ec45f
result: SUCCESS
```

### Backend

```text
pytest: 658 passed
Ruff: PASS
format: 203 files already formatted
MyPy: PASS on 136 source files
```

### Frontend

```text
26 test files / 181 tests passed
typecheck: PASS
lint: PASS
build: PASS
```

### Production bundle guard

PASS:

```text
Production bundle contains no Diorama debug/pilot leakage,
includes verified Office furniture assets,
and contains the production R3F Planning renderer.
```

### Production browser smoke

PASS in Playwright Chromium with software WebGL:

```text
Production Planning Office rendered through R3F
with no Diorama fixture leakage.
```

The smoke loads the built production bundle, opens `/office`, and verifies:

- production Planning heading exists;
- `data-office-renderer="r3f"` exists;
- a real WebGL canvas exists;
- the renderer host has non-trivial dimensions;
- no simulated Diorama fixture marker exists;
- no page error occurs.

## Production bundle evidence

Build output:

```text
R3FOfficeScene chunk
178.17 kB raw
56.71 kB gzip

main index
1,238.09 kB raw
330.83 kB gzip
```

The existing >500 kB main-chunk warning remains advisory. Phase 13A does not
silence or raise that warning threshold.

A future performance checkpoint should evaluate route/vendor code splitting
before adding post-processing or more 3D dependencies.

## Fallback evidence

`OfficeRendererBoundary.test.tsx` verifies that a React renderer failure
switches Planning from R3F to the existing Three.js renderer.

Production selection:

```text
Planning -> R3F
R3F React failure -> Three.js
Live -> Three.js
Replay -> Three.js
```

WebGL-unavailable environments retain the HTML planning/operational surface.
Both 3D renderers require WebGL.

## Truth invariants

Phase 13A changes renderer ownership only.

Unchanged:

- Task truth;
- Run truth;
- AgentRun truth;
- Event truth;
- Planning durable records;
- execution promotion rules;
- floor vocabulary;
- lighting contract;
- character/furniture source assets;
- camera policy.

No fake collaboration, typing, progress, testing, or execution state is added.

## Acceptance

Phase 13A is accepted for merge because all automated gates are green and the
built production Planning route is exercised directly in Chromium.
