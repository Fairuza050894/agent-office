# Agent Office Spatial Navigation — Technical Design

Status: Phase 10E implementation contract  
Date: 2026-09-29  
Branch: `phase-10e-spatial-navigation`

## Purpose

Phase 10E makes the shared 3D Office easier to operate as a spatial product
without adding permanent dashboard chrome.

The goal is not to make Agent Office more game-like. The goal is to make a
large 3D workplace navigable, legible, and pleasant enough that users can stay
inside it for real work.

The same interaction language applies to:

```text
WORKSPACE
LIVE
REPLAY
```

Only the truth source differs.

## Camera model

Every floor exposes three semantic camera slots:

```text
1  Overview
2  Primary work area
3  Secondary work area
```

The visible labels are floor-specific:

| Floor | 1 | 2 | 3 |
| --- | --- | --- | --- |
| L1 Commons | Overview | Lounge | Pantry |
| L2 Build | Overview | Engineering | QA / Review |
| L3 Strategy | Overview | Planning | Meeting |

The key is stable while the semantic label changes with the floor. This keeps
keyboard muscle memory predictable without reducing the building to generic
"Camera A / Camera B" controls.

Camera presets are presentation state only.

They do not create or modify:

- Run
- AgentRun
- Event
- Finding
- Evidence
- planning artifacts
- occupancy truth

## Cinematic transition contract

Selecting a preset starts a short camera interpolation.

Rules:

- duration is intentionally brief;
- interpolation uses a smooth-step curve;
- user orbit/pan input cancels the preset transition immediately;
- agent motion pause does not disable camera navigation;
- camera animation does not write operational Events;
- selected-agent focus may supersede a preset;
- no frame loop should remain active solely because a completed camera
  transition once occurred.

## Reduced motion

When the browser reports:

```css
prefers-reduced-motion: reduce
```

camera presets snap directly to their destination.

The decorative floor-change cue is hidden entirely.

This preserves spatial functionality without nonessential motion.

## Label layer

The Scene Controls menu exposes a label-layer toggle.

`Labels Off` hides the CSS2D scene labels only.

It must not hide:

- selected-agent inspector content;
- Bottom Operations Dock content;
- canonical Run / AgentRun state;
- Findings / Evidence surfaces;
- accessible HTML status information.

The label toggle is therefore a density control, not a data filter.

## Keyboard interaction

When focus is on the 3D surface and not on an interactive control or text input:

```text
1  first camera preset / Overview
2  floor primary-area preset
3  floor secondary-area preset
L  toggle scene labels
```

Shortcuts must not fire while typing or while an interactive button/link/control
owns focus.

## Floor transition cue

Changing floors may briefly show a restrained floor cue such as:

```text
L2  Build
```

This cue communicates presentation navigation only.

It does **not** claim:

- that an elevator ride occurred;
- that an Agent moved between floors;
- that time elapsed operationally;
- that any Event was recorded.

A real elevator/cross-floor character transition remains separate future work.

## Interaction hierarchy

Persistent UI remains intentionally small.

```text
scene header
  -> compact Controls disclosure
       -> semantic camera presets
       -> orbit / pan / zoom reminders
       -> Labels toggle

floor navigation
  -> L1 / L2 / L3
  -> Reset view
```

The camera controls are on demand rather than permanently reserving scene area.

## Performance

Camera interpolation reuses the existing renderer loop.

Important invariants:

- no React state updates are performed per animation frame;
- camera interpolation state lives in the Three.js engine runtime;
- a completed transition clears its runtime state;
- manual OrbitControls input cancels automated interpolation;
- agent animation and Replay timing remain independent.

## Truth invariant

> Camera movement changes what the user sees, never what the system claims
> happened.

This phase does not modify the established Live / Replay character-facing
calculation or path generation.
