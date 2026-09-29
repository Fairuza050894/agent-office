# Phase 10E Verification — Spatial Navigation & Cinematic Office UX

Status: IMPLEMENTED / DRAFT REVIEW  
Date: 2026-09-29  
Branch: `phase-10e-spatial-navigation`  
Base: `main@7e1b82a`

## Goal

Make the shared Agent Office materially easier and more enjoyable to navigate
without adding dashboard clutter or weakening the Workspace / Live / Replay
truth boundary.

## Delivered

### Semantic camera presets

Each floor exposes three compact views:

```text
Commons   Overview | Lounge      | Pantry
Build     Overview | Engineering | QA / Review
Strategy  Overview | Planning    | Meeting
```

Keyboard shortcuts remain stable:

```text
1 / 2 / 3
```

### Smooth camera travel

Preset selection uses a short smooth-step interpolation.

- manual OrbitControls input cancels the transition;
- camera travel still works while agent motion is paused;
- selected-agent focus remains able to take control;
- reduced-motion users receive an immediate camera snap.

### Label density control

`L` toggles CSS2D scene labels.

This is presentation-only. Inspector, Operations Dock, Run truth, Findings, and
Evidence remain outside the toggle.

### Floor-change cue

A brief restrained L1/L2/L3 cue reinforces that floors belong to one building.

It is deliberately not presented as a factual elevator ride.

### Shared scope behavior

The same controls are available in:

- Workspace
- Live
- Historical Replay

The truth source remains unchanged.

## Regression coverage

### Pure camera contract

`office3d/camera.test.ts` verifies:

- every floor has exactly three deterministic views;
- shortcuts are always 1 / 2 / 3;
- semantic labels differ by floor;
- preset coordinates remain within a bounded office camera envelope.

### OfficeScene

Coverage verifies:

- Workspace exposes Build-specific camera views;
- Replay/Run exposes Strategy-specific camera views;
- selecting a preset updates renderer camera state;
- Labels toggle reaches the renderer;
- keyboard 3 selects the secondary view;
- keyboard L toggles labels;
- existing floor-switcher containment remains intact.

## Safety / truth boundary

No changes were made to:

- Run state transitions;
- AgentRun state transitions;
- Replay event timing;
- movement paths;
- replay-facing yaw correction;
- planning approval;
- repository execution;
- Evidence generation.

The floor cue and camera movement are presentation only.

## Rendered acceptance

Verify locally in both normal and Maximize layouts:

1. L1 Controls shows Overview / Lounge / Pantry.
2. L2 Controls shows Overview / Engineering / QA / Review.
3. L3 Controls shows Overview / Planning / Meeting.
4. keyboard 1 / 2 / 3 works while the 3D canvas has focus.
5. camera travel feels smooth and short, not cinematic for its own sake.
6. beginning a manual drag during camera travel immediately restores manual
   control.
7. Labels Off removes scene nameplates without removing the inspector or dock.
8. keyboard L toggles labels while canvas/scene has focus.
9. shortcuts do not fire while typing in Composer or other form controls.
10. floor switching shows a restrained short cue and does not leave permanent
    overlay chrome.
11. `prefers-reduced-motion: reduce` removes the decorative floor cue and
    snaps camera presets.
12. Live movement remains forward-facing and unchanged.
13. Historical Replay movement remains forward-facing and unchanged.
14. floor switching still changes presentation only.
15. Workspace / Live / Replay still read as one Agent Office.

## Automated commands

```bash
cd frontend
npm test -- --run
npm run typecheck
npm run lint
npm run build

cd ../backend
pytest
ruff check .
ruff format --check .
mypy src

cd ..
git diff --check
```

Do not mark the phase automated-green unless these commands actually execute.


## Rendered fix — Controls panel containment

Rendered review on `/office` found the Phase 10E Controls disclosure opening
leftward from the trigger. Because the Office scene wrapper intentionally clips
overflow, the left edge of the panel was cut off.

The panel is now anchored from the trigger toward the open scene area:

- desktop / Maximize: opens to the right of `Controls`;
- narrow layouts: width is capped against the viewport;
- panel remains an overlay and does not reflow the Office HUD;
- camera buttons, interaction hints, and Labels control must all remain fully
  readable;
- no change to camera semantics, Run truth, Replay truth, or movement logic.

Rendered regression check:

1. open `Controls` on L1/L2/L3;
2. confirm the full first preset label is visible;
3. confirm `Drag`, `Right-drag`, `Wheel`, and `Labels` are not clipped;
4. repeat in Maximize;
5. repeat once in Live / Replay.
