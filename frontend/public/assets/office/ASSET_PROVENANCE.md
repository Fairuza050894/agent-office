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


## Phase 11 V2 engineering-pod pilot assets

The V2 development-only engineering-pod pilot uses a subset of the Kenney
Furniture Kit.

Authoritative source:

- creator: Kenney
- asset page: https://kenney.nl/assets/furniture-kit
- license: Creative Commons CC0 1.0

Deterministic transport mirror:

- repository: `Hidencod/tge-assets`
- commit: `1f7dee9076ee848773f08fd632ab4e4e73357777`

The transport mirror catalog records the Furniture Kit as Kenney / CC0 and
provides self-contained GLB files.

| Pilot file | Source path | Expected bytes | Git blob SHA |
| --- | --- | ---: | --- |
| `desk.glb` | `packs/furniture-kit/desk.glb` | 15048 | `8ca187070cd666239ab1d93dda2e98105f7de776` |
| `chairmoderncushion.glb` | `packs/furniture-kit/chairmoderncushion.glb` | 7376 | `a6c18d94ec17231807043b0fb18e766b020ec81e` |
| `computerscreen.glb` | `packs/furniture-kit/computerscreen.glb` | 6404 | `c509093d35ee40bb6791dde9ad8e9de4bc3348dd` |
| `computerkeyboard.glb` | `packs/furniture-kit/computerkeyboard.glb` | 3476 | `77e5b4fc0d2d4c748173068f8ec325497f3c9011` |
| `computermouse.glb` | `packs/furniture-kit/computermouse.glb` | 5868 | `333b20fad5121354f165ca7f77b6f2e777691bbb` |

These pilot binaries are not committed. They are fetched only for the V2
development harness, ignored by Git, and removed before production builds.


## Phase 11 V3 production Build furniture

V2 GO promotes the same verified five-file Kenney subset into the ordinary Build
floor.

Runtime fetch destination:

```text
frontend/public/assets/office/furniture/kenney-v1/
```

The binaries remain uncommitted. `predev` and `prebuild` fetch them from the
same pinned transport commit and verify exact byte size + Git blob SHA before
the application uses them.

V3 changes presentation, not source authority:

- desk wood → warm muted brown;
- desk/chair metal → slate/charcoal;
- chair cushion → muted blue-slate;
- device shells → dark neutral;
- display face → restrained cyan with low emissive intensity.

The material mapping is deterministic in
`frontend/src/office3d/officeFurnitureKit.ts` and mirrors the optional Blender
authoring helper in `tools/blender/normalize_office_furniture.py`.

The production renderer uses a primitive engineering-pod fallback only while the
verified kit is loading. The primitive group is removed only after the full kit
mount passes bounds validation.
