# Office View character asset

Agent Office uses **Business Man** by Quaternius as the primary Phase 8
humanoid because it is visibly clothed for an office setting and already ships
with a compatible animated humanoid rig.

## License and source

- title: Business Man
- creator: Quaternius
- source listing: https://poly.pizza/m/JFrLIKqvCH
- source pack: Ultimate Modular Men Pack
- license: CC0 1.0 Universal

## Deterministic transport

The binary GLB is intentionally not committed to Agent Office. It is fetched
during `npm run dev` and `npm run build` from:

- repository: `dantol29/wall_street_online`
- commit: `9ab58fecc42490b9212d62813a778c0cc8158726`
- source path: `apps/client/public/assets/BusinessMan.glb`
- local generated file: `quaternius-business-man.glb`
- expected bytes: `1529248`
- SHA-256: `82b81257c1e94cd9ee48cb1dcbe5ff506e81c9ce67cd0c5af542d8712dca546e`

The model includes its own idle, walk, run, interaction, and other animation
clips. Agent Office currently uses the neutral idle, forward walk, and
interaction clips.

## Orientation

The source character visually faces the opposite direction from the scene's
positive-Z movement convention. Agent Office applies a fixed 180-degree model
yaw inside the RuntimeAgent root. World-space movement and station orientation
remain owned by Agent Office canonical state.
