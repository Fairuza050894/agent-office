# Office View character assets

Phase 8 uses a deterministic cast of clothed Quaternius characters from the
Ultimate Modular Men/Women family. These assets are used only as visual
representations of factual AgentRuns.

## License

All five character models are authored by Quaternius and distributed under
CC0 1.0 Universal.

Source listings:

- Business Man: https://poly.pizza/m/JFrLIKqvCH
- Casual Character: https://poly.pizza/m/kZ3DmIoGip
- Hoodie Character: https://poly.pizza/m/gKLBoRsyKe
- Formal Woman: https://poly.pizza/m/nIItLV9nxS
- Smart/Casual Woman: https://poly.pizza/m/qJ2gsTUBHL

The source repository's asset manifest also records these files as Quaternius
CC0 assets.

## Deterministic transport

Binary GLB files are not committed to Agent Office. They are fetched during
`npm run dev` and `npm run build` from:

- repository: `JadenB9/casino-simulator`
- commit: `6d73cc9e68839b469f35a2fe11e246eaab2ae426`

| Local file | Source path | Expected bytes | Git blob SHA |
| --- | --- | ---: | --- |
| `char-m-suit.glb` | `client/public/assets/models/char-m-suit.glb` | 440404 | `32c16cc24a32b0760102d3fd7646dd97d4682efc` |
| `char-m-casual.glb` | `client/public/assets/models/char-m-casual.glb` | 395328 | `22200677afc9ef3a9250ccdbf10bb52a1fc9c884` |
| `char-m-hoodie.glb` | `client/public/assets/models/char-m-hoodie.glb` | 418592 | `86d6622910bccb45a76c842102baba3ee2d6d170` |
| `char-f-dress.glb` | `client/public/assets/models/char-f-dress.glb` | 415408 | `e655f78f69908d5f53400bf32a970b31c15f81d5` |
| `char-f-smart.glb` | `client/public/assets/models/char-f-smart.glb` | 433156 | `ce39fe182e39e6a44118e5ed1fc33c16167e8804` |

The bootstrap verifies:

1. exact byte size,
2. exact Git blob SHA-1,
3. the presence of the `Idle`, `Walk`, and `Run` animation clips.

Invalid or partial downloads are removed.

## Runtime mapping

Character variation is deterministic from `agent_profile_key`, with explicit
role mappings for the standard Agent Office roles and a stable hash fallback for
future roles. Reloading the page does not randomly change an agent's avatar.

All models use their own embedded skeleton and animation clips.

The Quaternius models are authored facing the opposite direction from Agent
Office's +Z movement convention, so the visual model receives a fixed local
180-degree yaw while the RuntimeAgent root remains aligned to factual movement.
