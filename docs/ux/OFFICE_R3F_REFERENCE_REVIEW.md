# Agent Office R3F Reference Review

Status: Reference captured for post-V3 renderer experiments  
Source: owner-provided `agent-office-r3f-mockup-src.zip` and
`agent-office-r3f-diorama.html`

## Why this reference matters

The supplied mockup is useful because it demonstrates a compact 3D-first Office
using the same Three.js major/minor line as Agent Office while structuring the
scene declaratively.

Its package uses:

```text
React 19
Three 0.181.2
@react-three/fiber 9.x
@react-three/drei 10.x
@react-three/postprocessing 3.x
postprocessing 6.x
```

The source explicitly labels its domain records as sample data. Those records
are presentation examples only and are not copied into Agent Office.

## Patterns worth carrying forward

### Declarative scene boundaries

The reference separates responsibilities such as:

```text
Shell
Furniture
LightRig
Rig
Person
Plate / Marker
```

Agent Office should move toward comparable boundaries, but canonical workflow
state remains outside the renderer.

V3 begins that separation with:

```text
furniturePolicy.ts
officeFurnitureKit.ts
environment placement contract
```

### Damped focus rather than free-camera repair

The reference camera dampens toward either the office home view or the selected
agent.

This aligns with the accepted Agent Office camera policy:

- snap/floor presets;
- selected-agent focus;
- bounded zoom;
- no free orbit/pan requirement.

### Reduced motion

The reference checks `prefers-reduced-motion` and removes slow easing where
appropriate.

Agent Office already applies reduced-motion handling to camera transitions and
must preserve that requirement in any future R3F renderer.

### Procedural textures

The mockup creates deterministic canvas textures for:

- wood flooring;
- wall treatment;
- rug;
- whiteboard;
- soft shadow/glow/ring visuals.

These are useful techniques for future visual polish because they avoid external
runtime texture requests.

They are not added in V3 because V3 is scoped to the accepted Build furniture
rollout.

### Truth labels and dual representation

The reference pairs the 3D scene with textual roster/inspector content and
visually distinguishes canonical work from ambient office presence.

That is compatible with Agent Office's rule that 3D is supplemental and
operational state must remain text-complete and keyboard accessible.

## Patterns that require separate gates

The reference optionally uses:

```text
N8AO
Bloom
ACES tone mapping
SMAA
Vignette
```

Agent Office does not adopt that stack in V3.

Any post-processing experiment must compare:

- desktop/mobile;
- day/night;
- renderer calls/triangles;
- frame cost where measurable;
- visual benefit;
- reduced-motion/accessibility impact.

The accepted V1 light budget remains authoritative.

## Patterns that must not be copied

The mockup includes illustrative:

- AgentRun identifiers;
- AgentEvent text;
- blocked task text;
- stage progress;
- replay/timeline positions.

Agent Office may render equivalent concepts only when they come from canonical
backend truth.

No mockup value may become hidden fallback product state.

## R3F pilot boundary

After V3 acceptance, a separate R3F pilot may be created.

The experiment should use the same inputs:

```text
OfficeProjection
Office world/time profile
floor/zone placement
canonical AgentRun state
selected agent
camera preset
```

and render through either:

```text
current imperative Three renderer
or
R3F pilot renderer
```

The renderer must not own workflow transitions.

## Unity

The reference provides no requirement that would justify Unity for the current
web product.

Unity remains outside the Agent Office web runtime unless a future requirement
cannot reasonably be met by the existing browser stack.
