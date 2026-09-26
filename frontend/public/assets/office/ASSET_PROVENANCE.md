# Office View character assets

The Office View uses Quaternius CC0 character and animation assets that are
fetched deterministically during `npm run dev` and `npm run build`.

The binary GLB files are intentionally not committed by Agent Office. The
bootstrap script downloads pinned, already-audited conversions from:

- repository: `Seyamalam/blood-league-kickoff`
- commit: `aa02a4e6d8337a0604d2da131bcbbeb1f01badf0`

## Character

- upstream pack: Quaternius Universal Base Characters — Standard
- source model: `Superhero_Male_FullBody`
- license: CC0 1.0
- local generated file: `quaternius-office-character.glb`
- expected bytes: `6465208`
- SHA-256: `a466828c67a4acc9b2413212ce6d9cde235e3aed9b675680c14fd9673858f118`

The upstream conversion embeds the source textures and preserves the compatible
Quaternius humanoid rig.

## Animation library

- upstream pack: Quaternius Universal Animation Library — Standard
- license: CC0 1.0
- local generated file: `quaternius-universal-animation-library.glb`
- expected bytes: `2714756`
- SHA-256: `4c748767741a3e495d89667b9a218b690ba9810b9517a12e960780e3ca72c4e9`

Agent Office uses non-root-motion clips so canonical AgentRun movement remains
owned by the control plane rather than by animation root motion.

The full CC0 license texts are stored beside this file.
