# ADR-0004 — Office Renderer Evolution after V2

Status: Accepted; amended for Phase 23 release hardening  
Date: 2026-10-02  
Amended: 2026-10-03

## Context

The original V3 decision kept the imperative Three.js renderer while an R3F pilot proved the renderer-neutral seams. Since then, production migration has completed:

- Planning uses R3F in the normal production path;
- Live uses R3F in the normal production path;
- Replay uses R3F in the normal production path;
- Three.js remains only behind the tested renderer recovery boundary;
- HTML operational surfaces remain the final non-WebGL fallback.

The canonical Office truth remains outside either renderer. Rendering code must project Task/Run/AgentRun/Event and Workspace/Living Office truth rather than create operational state.

## Decision

### Production renderer

R3F is the canonical production renderer for Planning, Live, and Replay.

The imperative Three.js renderer is a **temporary compatibility fallback**, not a second product surface and not an independent feature target.

New Office visual/product functionality should be implemented in R3F first. A fallback change is justified only when required to preserve recovery behavior.

### Renderer-neutral boundaries

Furniture, environment, navigation, role identity, lighting, replay projection, and living-office policy remain renderer-neutral wherever practical. Renderer code must not own workflow truth.

### Failure behavior

R3F failure may fall back to Three.js while the fallback remains accepted. If both WebGL renderer paths fail, HTML operational surfaces remain usable for factual Task/Run decisions.

A visual failure must never fabricate or remove canonical execution state.

### Asset delivery

Production/dev bootstrap verifies pinned third-party Office assets before build/render preparation. External assets remain correctly attributed and are not relabeled as Agent Office-authored Blender work.

Blender remains an offline authoring/optimization option, not an application runtime dependency.

### Post-processing

Expensive post-processing remains opt-in only after measured performance/legibility evidence. Visual effects may not make operational status harder to read.

### Unity / alternate runtime

No second game engine/runtime is introduced without a separate architecture decision demonstrating a product requirement that R3F/Three cannot satisfy.

## Three.js fallback sunset criteria

The fallback may be removed only in a dedicated PR after **all** of the following are true on the same production checkpoint:

1. Planning, Live, and Replay R3F production smoke remains green for at least three consecutive release checkpoints.
2. Deterministic screenshot/visual-regression coverage exists for the primary Office scopes and catches material layout/visibility regressions rather than only renderer startup.
3. R3F has an accepted device/browser matrix covering the supported desktop targets and a documented degraded/non-WebGL experience.
4. R3F error telemetry or an equivalent reproducible failure-reporting mechanism can distinguish renderer failure from API/data failure.
5. No production-only capability remains implemented exclusively in Three.js.
6. The HTML operational fallback is verified independently so removing Three.js does not remove access to Task/Run decisions.
7. Bundle and maintenance impact of deleting Three.js fallback code is measured and recorded.
8. A rollback plan exists for the release that removes it.

Until those criteria are met, Three.js remains recovery-only and receives no speculative feature investment.

## Consequences

Positive:

- R3F has one clear production ownership model;
- dual-renderer maintenance is bounded by explicit sunset criteria;
- fallback retirement cannot happen on visual preference alone;
- canonical truth remains independent of renderer lifecycle;
- future custom art can evolve without changing Task/Run truth.

Tradeoffs:

- some duplicate renderer code remains until the criteria are satisfied;
- fallback smoke must continue to be maintained;
- visual-regression and device evidence are required before code deletion.

## Historical note

The original V3 decision intentionally separated furniture rollout from R3F migration. That sequencing is complete and remains valid history; this amendment supersedes the old statement that R3F was only an experiment.
