# Living Office — Technical Design

Status: Production design, updated for RC1  
Renderer authority: R3F production, Three.js recovery  
Primary frontend: React + TypeScript + React Three Fiber / Three.js

## 1. Architecture boundary

Living Office is a projection layer. It is not a second workflow engine and is
not a source of operational truth.

```text
Canonical planning / execution state
        +
Office schedule / explicit ambient policy
        |
        v
Presence + runtime projection
        |
        v
OfficePresenceMember[] / OfficeSceneMember[]
        |
        v
R3FOfficeScene
        |
        +--> environment.ts
        +--> premiumEnvironment.ts
        +--> character.ts
        +--> lighting.ts
        +--> camera.ts
```

The renderer never decides whether work factually happened.

## 2. Canonical truth and presentation truth

Operational truth remains rooted in durable application records including:

```text
Project
Task
Run
AgentRun
Event
Evidence
ResultReview
```

Living Office may also render explicitly classified planning or ambient
presence. Those projections must remain visually and semantically distinct from
factual execution.

No Office presentation code may fabricate:

- Run progress;
- tests or verification;
- conversations;
- meetings;
- KPI;
- approvals/delivery;
- repository changes.

## 3. Primary frontend modules

### `office3d/livingOffice.ts`

Owns floor definitions, zone taxonomy, deterministic presence policy, planning
presence, and presentation-only ambient rules.

### `office3d/runtimeProjection.ts`

Projects canonical Run/AgentRun state and workspace presence into renderer-safe
scene members. It is the important truth seam between application state and
3D runtime state.

### `office3d/environment.ts`

Owns procedural floor geometry, functional zones, deterministic station anchors,
collision/path targets, and the established room/detail props.

### `office3d/premiumEnvironment.ts`

Owns RC1 presentation-only architectural framing. It is mounted by the R3F
production scene after the canonical environment is created.

The premium layer:

- adds no workflow state;
- adds no `THREE.Light` objects;
- remains outside the walkable collision volume;
- uses instancing for repeated static geometry;
- gives Commons, Build, and Strategy distinct spatial identities.

See `RC1_PREMIUM_3D_ARCHITECTURE.md`.

### `office3d/character.ts`

Owns character model variants, role appearance, nameplates, animation mixer,
selection treatment, and renderer runtime behavior.

It accepts canonical AgentRun-derived members as well as explicitly classified
planning/ambient presentation members. Presentation classification never
upgrades ambient presence into execution truth.

### `office3d/lighting.ts`

Owns deterministic time-of-day lighting profiles. Lighting changes readability
and atmosphere only.

### `office3d/camera.ts`

Owns semantic camera presets and bounded camera-control policy.

### `components/R3FOfficeScene.tsx`

Owns the production WebGL/R3F lifecycle, scene composition, environment rebuild,
character runtime synchronization, pointer selection, live/replay motion,
labels, camera focus, and development renderer evidence.

### `components/ThreeOfficeScene.tsx`

Recovery renderer only. It remains tested while the fallback sunset criteria in
ADR-0004 are unmet. New speculative visual work does not need duplicate feature
implementation here.

### `components/OfficeScene.tsx`

Owns the semantic renderer wrapper and recovery/fallback selection.

### `pages/OfficeWorkspacePage.tsx`

Owns workspace Office composition, active floor, project/planning context,
Office clock projection, Composer integration, and selected-member inspection.

## 4. Floor model

```text
commons  -> L1 -> social / arrival hub
build    -> L2 -> engineering control room
strategy -> L3 -> planning / decision studio
```

Run Office keeps Build as the normal operational default unless a canonical
mapping says otherwise.

Changing workspace floor is presentation state. It must not create or mutate a
Task, Run, AgentRun, ResultReview, or repository state.

## 5. Presence identity

The presentation contract remains conceptually:

```ts
interface OfficePresenceMember {
  id: string
  agent_profile_key: string
  name: string
  status: OfficePresenceState
  behavior: OfficeBehaviorKey
  floor: OfficeFloorKey
  zone: OfficeZoneKey
  placementIndex: number
  truth: 'PLANNING' | 'AMBIENT'
}
```

Operational members come from the Run/AgentRun projection path rather than being
reclassified from ambient presence.

Stable IDs are required so floor/zone changes move an existing character rather
than creating a fictional new worker.

## 6. Behavior policy

Presentation behaviors may include:

```text
ARRIVAL
AVAILABLE
DESK_FOCUS
PLANNING_MEETING
WAITING_DECISION
COFFEE_CHAT
LUNCH
SOCIAL_CHAT
GAME_BREAK
PRAYER_QUIET
OFFLINE
```

Behavior remains deterministic and bounded. Ambient routines must never override
higher-priority factual Run state.

Priority model:

```text
critical factual event
> active factual AgentRun state
> waiting user / planning decision
> configured scheduled event
> ambient routine
```

Prayer behavior remains behind explicit schedule/configuration data; fixed daily
prayer times must not be hard-coded.

## 7. Movement and collision

Each Office zone owns deterministic station placements.

- selected-floor members receive stable targets;
- Build AgentRuns preserve established role workstation mappings;
- movement uses the shared runtime path loop;
- premium architecture is deliberately outside the walkable volume;
- presentation architecture must not silently create new collision truth.

Live and Replay share movement orientation rules so a character does not appear
to walk backwards when the same canonical direction is replayed.

## 8. Animation policy

Only verified animation clips may be claimed.

Missing typing/review/talking/sitting clips fall back to supported animation
rather than pretending the action exists. Historical experiments with
incompatible rigs remain rejected unless an offline, deterministic retargeting
pipeline is introduced with provenance and visual-regression evidence.

Animation is presentation, never Evidence.

## 9. Time-of-day lighting

Profiles remain:

```text
morning
day
evening
night
```

They control background, hemisphere ambience, directional key light, and
exposure. RC1 increases cinematic separation while keeping status/nameplate
legibility and existing light-count budgets.

## 10. Premium environment composition

RC1 mounts `premiumEnvironment.ts` after the canonical procedural environment.
This ordering is intentional:

```text
clear previous environment
  -> build Office shell + selected functional floor
  -> resolve deterministic station placements
  -> mount premium presentation architecture
  -> mount optional verified furniture kit
  -> instantiate/synchronize characters
```

The premium layer contains abstract signal geometry only. It does not display
fake graphs, fake service health, fake progress, fake KPI, or fake dialogue.

## 11. Performance guardrails

Current guardrails include:

- only one selected floor is active;
- shared asset caches;
- deterministic model variants;
- one shared R3F frame lifecycle;
- bounded device pixel ratio;
- no uncontrolled per-character requestAnimationFrame loop;
- repeated premium architecture uses `THREE.InstancedMesh`;
- no extra premium-layer light objects;
- static architecture has no per-frame animation.

The V2 Diorama reference ceilings remain useful regression evidence:

```text
Desktop: draw calls <= 276, triangles <= 33,304
Mobile:  draw calls <= 225, triangles <= 25,320
```

RC1 adaptive-quality work may introduce tighter product-specific budgets later,
but must do so from measured evidence rather than browser/user-agent guesses.

## 12. Camera and interaction

RC1 uses closer semantic camera compositions so characters and room identity
occupy more of the viewport.

Free pan/rotate remain constrained. Selection may temporarily focus the camera
on a character; Replay may temporarily focus a factual event participant.
Neither behavior changes Run state.

Hover and selection are presentation-only. HTML operational surfaces remain the
complete accessibility/fallback route for decisions when 3D is unavailable.

## 13. Testing and release evidence

Unit/integration coverage should continue to lock:

- floor and zone catalogs;
- planning/ambient truth classification;
- deterministic presence and placement;
- Run Office workstation clearance;
- movement orientation;
- camera bounds;
- lighting profiles;
- premium architecture floor identity;
- zero premium-layer light additions;
- batched premium geometry budget;
- production Office guard;
- Planning / Live / Replay renderer smoke.

A GitHub Actions run is accepted only if its runner starts and repository,
backend, and frontend job steps actually execute and pass. Missing-step/log
infrastructure failures are not green.

## 14. Recovery and sunset

Normal path:

```text
R3F -> Three.js recovery -> HTML operational fallback
```

The Three.js path may be retired only through the criteria in
`ADR-0004-office-renderer-evolution.md`, including visual regression,
device/browser evidence, failure observability, rollback planning, and proof
that no production-only capability remains exclusive to the fallback.

## 15. RC1 continuation

After premium environment activation, the remaining visual/product work is:

1. richer character presentation and grounded material treatment;
2. Composer-first zero-friction workflow refinement;
3. Decision Inbox / Board / KPI / Dossier polish;
4. adaptive quality/performance;
5. deterministic visual regression and browser/device QA;
6. dependency hardening on latest `main`;
7. RC1 release packaging and rollback evidence.
