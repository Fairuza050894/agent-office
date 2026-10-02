# ADR-0003 — Office Diorama Pilot Asset Transport

Status: Accepted for Phase 11 V2 pilot  
Date: 2026-10-02

## Context

Phase 11 V2 needs a real low-poly furniture pilot for the Build
`engineering-pod`, while Agent Office currently keeps binary GLB files out of
Git and fetches verified character assets during local tooling.

The V2 owner direction requires:

- one coherent visual kit;
- verified license and source;
- deterministic transport;
- no binary asset commit without an explicit policy decision;
- A/B review before any production rollout.

## Decision

### Source authority

Use the Kenney Furniture Kit as the V2 pilot source.

```text
author: Kenney
official source: https://kenney.nl/assets/furniture-kit
license: Creative Commons CC0 1.0
```

Only the engineering-pod subset is used.

### Deterministic transport

Use the public `Hidencod/tge-assets` mirror only as the binary transport
endpoint.

```text
repository: Hidencod/tge-assets
commit: 1f7dee9076ee848773f08fd632ab4e4e73357777
```

The mirror catalog identifies the Furniture Kit as Kenney / CC0 and stores
self-contained GLB files.

Every fetched pilot asset must match both:

1. exact byte size;
2. exact Git blob SHA-1.

### Binary policy

V2 does **not** change the repository's binary policy.

Pilot GLBs:

- are not committed;
- live only under an ignored development asset directory;
- are fetched by an explicit pilot bootstrap;
- are removed before every production build;
- must not appear in `dist/`.

Production Office keeps the primitive engineering pod until the owner accepts
the V2 A/B result.

### Runtime policy

The Kenney pilot is development-only:

```text
/office?fixture=diorama&pilot=kit&floor=build
```

Default and production behavior remains:

```text
pilot=primitive
```

Repeated static furniture is rendered using `THREE.InstancedMesh`, not one
independent mesh tree per workstation.

## Selected V2 files

| Local pilot file | Source path | Bytes | Git blob SHA |
| --- | --- | ---: | --- |
| `desk.glb` | `packs/furniture-kit/desk.glb` | 15048 | `8ca187070cd666239ab1d93dda2e98105f7de776` |
| `chairdesk.glb` | `packs/furniture-kit/chairdesk.glb` | 39016 | `131101f3dbc72f41ca624ddd77ce53d8bafea9ed` |
| `computerscreen.glb` | `packs/furniture-kit/computerscreen.glb` | 6404 | `c509093d35ee40bb6791dde9ad8e9de4bc3348dd` |
| `computerkeyboard.glb` | `packs/furniture-kit/computerkeyboard.glb` | 3476 | `77e5b4fc0d2d4c748173068f8ec325497f3c9011` |
| `computermouse.glb` | `packs/furniture-kit/computermouse.glb` | 5868 | `333b20fad5121354f165ca7f77b6f2e777691bbb` |

## Consequences

Positive:

- consistent low-poly furniture language;
- license and provenance are explicit;
- deterministic reproducibility;
- no production asset commitment before visual approval;
- repeated props can be instanced.

Tradeoffs:

- V2 requires an explicit pilot-asset fetch before A/B screenshots;
- the pilot depends on a pinned public transport mirror;
- a later production rollout must revisit whether transport should remain remote
  or move to an owner-controlled mirror.

## Rejected alternatives

### Commit GLB binaries now

Rejected for V2 because the owner has not approved changing the current binary
policy.

### Load assets directly from Kenney at runtime

Rejected because a product page/download redirect is not a deterministic runtime
transport contract.

### Adopt Unity or migrate to R3F during the pilot

Rejected as unrelated to the asset A/B question and too large for one phase.

## Follow-up

If the owner approves the V2 pilot, V3 may roll the accepted style through the
Build floor and may separately revisit long-term asset transport.
