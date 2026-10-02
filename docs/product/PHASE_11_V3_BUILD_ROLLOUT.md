# Phase 11 Office Diorama V3 — Build Floor Rollout

Status: IMPLEMENTING / Draft verification

## Goal

Promote the accepted V2 Kenney engineering-pod furniture direction into the
ordinary Build floor without changing canonical execution truth, floor
navigation, camera policy, or the accepted V1 lighting contract.

V3 also converts the one-off pilot code into a renderer-neutral asset boundary
that can be consumed by a later R3F proof of concept.

## Inputs

Accepted V2 evidence:

```text
pilot mode: pilot-ab
capture matrix: 8 / 8
source assets: 5
instanced placements: 80
V2 decision: GO
```

Reference implementation studied for V3:

```text
user-provided agent-office-r3f-mockup-src.zip
user-provided agent-office-r3f-diorama.html
```

The reference is used for architectural and visual lessons only. Its sample
Run/Event/timeline values are not product truth and are not copied.

## Production rollout

Ordinary Build Office now follows:

```text
create primitive engineering pod as safe fallback
        ↓
load verified Kenney furniture kit
        ↓
normalize + validate mounted bounds
        ↓
remove primitive furniture only after kit is ready
```

If the kit fails to load in an ordinary Build Office, the primitive fallback
remains visible.

The deterministic Diorama fixture preserves explicit A/B behavior:

```text
pilot=primitive → primitive only
pilot=kit       → kit candidate only
no pilot param  → ordinary production rollout behavior
```

Commons and Strategy are unchanged.

## Asset transport

V3 keeps binary GLBs uncommitted.

`predev` and `prebuild` fetch the accepted subset into:

```text
frontend/public/assets/office/furniture/kenney-v1/
```

Every file is verified against:

- exact byte size;
- exact Git blob SHA;
- pinned transport commit.

The production bundle guard verifies the same five GLBs are present and intact,
while still rejecting V2 debug/pilot leakage.

## Build material language

The raw V2 candidate was intentionally accepted for shape/pipeline direction but
its light cream palette was not final.

V3 maps source material names into the Build palette:

| Source role | Build presentation |
| --- | --- |
| desk wood | warm muted brown |
| general metal | slate |
| chair frame | charcoal slate |
| chair cushion | muted blue-slate |
| device shells | dark neutral |
| display surface | restrained cyan + low emissive |

The mapping lives in `officeFurnitureKit.ts` so Three.js and a later R3F
renderer can share the same asset contract.

## Blender authoring helper

V3 adds:

```text
tools/blender/normalize_office_furniture.py
```

It mirrors the runtime material contract and can bake the approved palette into
GLBs during a future authoring/optimization pass.

Blender remains an offline authoring tool, not a runtime dependency.

A baked GLB must not replace the verified runtime source until it gets its own
integrity/provenance entry and renderer comparison.

## R3F-ready boundary

V3 does not migrate the renderer to React Three Fiber.

Instead it isolates:

- furniture policy;
- asset loading;
- material language;
- placement contract;
- production fallback behavior.

A later R3F pilot should consume canonical OfficeProjection state rather than
reimplement Run or AgentRun truth.

Lessons accepted from the supplied R3F mockup:

- declarative scene composition is easier to evolve than one monolithic scene;
- damped focus transitions are preferable to unrestricted camera repair;
- reduced-motion behavior is a first-class visual requirement;
- 3D remains supplemental to HTML operational state;
- expensive post-processing must be measured rather than assumed.

## Explicitly not in V3

- no R3F dependency;
- no full renderer rewrite;
- no Unity runtime;
- no Commons/Strategy furniture rollout;
- no Shift Ruler implementation;
- no hard-coded Run/Event/sample timeline data;
- no change to canonical Task / Run / AgentRun / Event state;
- no increase to the accepted V1 light budget.

## Verification

Required owner-machine gate:

```bash
cd frontend
npm test -- --run
npm run typecheck
npm run lint
npm run build
npm run office:debug:prod-check
npm run office:shots
npm run office:pilot-shots

cd ..
python3 -m py_compile tools/blender/normalize_office_furniture.py
./scripts/verify.sh
git diff --check
git status --short
```

Rendered review must compare V3 `kit` day/night at desktop/mobile against the
accepted V2 screenshots and confirm:

- furniture is no longer raw cream/white;
- workstation silhouettes remain readable;
- screen emissive treatment stays restrained;
- agents/stations remain aligned;
- mobile remains contained;
- night remains readable;
- draw calls and triangles stay within the accepted V2/V1 ceilings.

V3 is not complete until those gates pass.
