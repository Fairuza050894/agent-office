# RC1 Character Presentation

Status: RC1 production presentation candidate  
Date: 2026-10-03

## Purpose

This slice improves how people read and inspect Office characters without
changing what those characters are allowed to claim.

Character presentation is subordinate to canonical application truth:

```text
AgentProfile + AgentRun / explicit Office presence
                     |
                     v
             RuntimeAgent projection
                     |
                     v
      verified model / fallback model
        + state indicator + nameplate
```

A character can make a factual state easier to read. It cannot create a new
factual state.

## Existing role distinction

Agent Office already maps known roles to deterministic presentation profiles
with distinct combinations of:

- verified character variant;
- scale;
- material accent;
- idle phase/rate.

The production asset set remains the existing provenance-pinned local character
pack. RC1 does not claim that a first-party Blender-authored character library
exists yet.

Unknown role keys continue to receive deterministic fallback appearance rather
than random styling.

## RC1 readability treatment

The premium character layer focuses on nameplate and interaction hierarchy:

- compact dark control-room nameplates;
- stronger name/state typography separation;
- factual state accent rail;
- clearer hover state;
- clearer selected state;
- restrained blocked/failed breathing emphasis;
- reduced-motion compliance;
- mobile density adjustment.

The nameplate layer is CSS2D presentation. It adds no WebGL meshes, lights, or
animation mixers and therefore does not consume the 3D draw-call budget.

## State color boundary

Color remains a rendering aid for the already-projected state:

```text
active / completed / available -> green family
starting / waiting / break      -> amber family
blocked / failed                -> red family
other / neutral                 -> slate family
```

This mapping does not infer health, quality, productivity, or completion beyond
the canonical state already supplied to the character runtime.

## Animation boundary

Only verified clips may be played. Candidate names may be requested by a
behavior policy, but the runtime falls back to verified Idle when that clip is
not present.

RC1 must not fabricate:

- typing;
- code review;
- testing;
- talking;
- meetings;
- prayer;
- gaming;
- other concrete activity

merely to make the Office look busy.

Ambient idle movement remains presentation-only and must remain visibly subtle.

## Accessibility and performance

- CSS2D labels remain non-authoritative visual aids; HTML product surfaces are
  the complete operational fallback.
- the premium stylesheet intentionally avoids CSS `transform` on the
  nameplate element because `CSS2DRenderer` owns that transform every frame.
- blocked/failed breathing animation respects `prefers-reduced-motion`.
- mobile nameplates use reduced dimensions and blur strength.
- no additional 3D geometry or lights are introduced by this slice.

## Acceptance

The slice may merge only when the exact PR head passes a real GitHub Actions run
with repository, backend, frontend, build, production Office guard, Chromium,
and production renderer smoke steps actually executing.

A GitHub platform failure before runner startup is not green evidence.
