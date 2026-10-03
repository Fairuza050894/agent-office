# Agent Office Current Milestone

## Current checkpoint

```text
accepted main: b132e4667b0ef24c6c89053af939a1b04efa2d89
Phase 22 Enterprise Trust Layer — COMPLETE / MERGED
Phase 23 Release Hardening — COMPLETE / MERGED
Phase 24 Office Operating Experience — COMPLETE / MERGED
Phase 25 Decision & KPI Cockpit — COMPLETE / MERGED
RC1 Slice 1 Premium Product Framing — COMPLETE / MERGED
RC1 Slice 2A Cinematic Lighting — COMPLETE / MERGED
RC1 Slice 2B Camera Composition — COMPLETE / MERGED
RC1 Zero-Friction Navigation — COMPLETE / MERGED
RC1 Premium Environment & Floor Identity — COMPLETE / MERGED
RC1 Premium Character Presentation — COMPLETE / MERGED
RC1 Premium Room Richness — FUNCTIONALLY MERGED / CORRECTED BY #71
RC1 Visual Composition Reset — COMPLETE / MERGED / VISUALLY REVIEWED
```

Canonical full verification remains:

```bash
./scripts/verify.sh
```

A GitHub Actions result counts as release evidence only when the runner actually
starts and the repository, backend, and frontend jobs execute their real steps.
A pre-run infrastructure failure with missing steps/logs is not green evidence.

For visual Office work, functional CI is necessary but no longer sufficient.
The exact PR head must also generate an Office screenshot matrix that is
inspected before merge.

## Phase 22–25 exact evidence

```text
Phase 22 / PR #47
head: 3f151fbdeab69f75fdcc48f906ca8cd6ed9b7139
verify #1563: SUCCESS
merge: e60610732d3aa642f2da9abfc0e44bd54de9c354

Phase 23 / PR #49
head: 7ef0187016427ca8242aa39a14e73810e5fe52e6
verify #1591: SUCCESS
merge: b4bc5273580130c4dd706fd5b1ba076f3ce01f96

Phase 24 / PR #50
head: 5940cdd9d623d0b826e4148fdd2cfcf139b97da8
verify #1592: SUCCESS
merge: e0090ed405bc36522a562b75d066b750418d3dd7

Phase 25 / PR #52
head: 6d065cb52586c2830ce3a426258c5a46f3770d93
verify #1593: SUCCESS
merge: 8c6f94d259be27093b02d9017dbb1722bd956d31
```

Accepted Phase 22–25 truth remains unchanged: human ResultReview decisions and
accepted delivery remain distinct from technical completion; KPI and dossiers
come from canonical records; managed delivery remains local and Agent Office
runtime behavior never automatically pushes or merges a user's project default
branch.

## RC1 merged evidence

### Premium product framing — PR #61

```text
head: c54ab44df586161aefa285a535f4392df4c58424
verify #1607: SUCCESS
merge: f40b58c8f97a58fc5f8660bd7e179ba406608f0f
```

### Cinematic lighting — PR #62

```text
head: 4c4d178fb2859fa64302d6080f09845c10af891e
verify #1609: SUCCESS
merge: 6245c28aa166c14ea5283febb8e7ae0cc7feed6e
```

### Camera composition — PR #63

```text
head: 16594e5bb1c4f6b16150d05bc9aacff01dbb2171
verify #1611: SUCCESS
merge: 3c553d888702fbbde1856107a52ab232e0c9cf6c
```

### Zero-friction navigation — PR #64

```text
head: 964117e0d9fc3ac03d3ca649116365be8bd95403
verify #1613: SUCCESS
merge: 3acba39a59d991f019e5208be70cb44290320ada
```

Accepted state: primary navigation is Office -> Inbox -> Task Board -> Project
KPI; lower-frequency controls remain under More tools without removing routes or
adding automatic decision/execution behavior.

### Premium Environment & Floor Identity — PR #65 / sync #66

```text
PR #65 head: b39f6c4957b260b81ad1b8406badaa8101157ba8
verify #1615: SUCCESS
merge: 544f593ca198c8dbe2b7cab703df17483b7c6ee5
post-merge main verify #1616: SUCCESS

milestone sync PR #66
head: 8c6afbaa739ad4ec183d9fe5a0675376d8365168
verify #1617: SUCCESS
merge: 88f01c76b04f88af193f4fd00c25d2371a8f3b9d
post-sync main verify #1618: SUCCESS
```

### Premium Character Presentation — PR #67

```text
head: a2459708392d61ee010bf954769ab0d3c61c3790
verify #1619: SUCCESS
merge: 8e17a248dca02b5a9e07c7b602b806ab6ca3c8a8
post-merge main verify #1621: SUCCESS
```

Accepted state:

- premium CSS2D nameplates improve factual name/state hierarchy, hover,
  selection, and restrained blocked/failed emphasis;
- deterministic role/model/accent profiles and verified animation fallback
  remain the character truth boundary;
- no fabricated typing, testing, review, meetings, dialogue, KPI, or concrete
  work was added.

### Premium Room Richness — PR #69 / sync #70

```text
superseded PR: #68 — CLOSED / NOT MERGED / NO FORCE-PUSH
successor PR: #69
head: 8114de89033b70064d36c5a55c9550da186ef5b5
verify #1623: SUCCESS
merge: f0f35c17b777f867866c41c480fbacb9bf810f4c
post-merge verify #1624: SUCCESS

milestone sync PR #70
head: 6f0522dc0ab4df48e4f052eac26a42cdd74f52cb
verify #1625: SUCCESS
merge: c00447a809fa020eef496786c481699bda5c194b
post-sync verify #1626: SUCCESS
```

The functional evidence above remains valid, but manual production screenshots
on 2026-10-04 showed that the visual composition itself was not acceptable:
room-spanning beams looked like a debug cage, signal rails dominated the room,
overview cameras were too distant, and night lighting produced an excessive
orange/brown wash. That finding is retained as historical evidence rather than
being hidden by the corrective work.

### Visual Composition Reset — PR #71

```text
PR: #71
exact verified head: 643b83cb4cb36b9aad4726173676d0305c8b6e45
GitHub Actions verify #1627: SUCCESS
visual artifact: office-visual-acceptance / artifact 11280457999
visual artifact digest: sha256:45c4e4075c000333fee9000561fe608ec2a482b8f8afab29d61035594b99ae20
merge commit: b132e4667b0ef24c6c89053af939a1b04efa2d89
post-merge main verify #1628: SUCCESS
```

Accepted corrective state:

- room-spanning decorative overhead beams are removed;
- the suspended command beacon is removed;
- full-room neon framing is replaced with short wall/perimeter anchors;
- Commons, Build, and Strategy keep distinct identity through restrained
  wall-adjacent architecture and their existing furniture composition;
- decorative emissive intensity is reduced and primary sight lines remain open;
- overview/focus cameras use a tighter semantic envelope;
- night lighting uses a cooler neutral key instead of the previous orange-heavy
  treatment;
- premium architecture remains presentation-only, instanced, and adds no
  `THREE.Light` ownership or canonical workflow/collision/occupancy truth;
- regression tests cap decorative horizontal spans at 9 scene units so the
  room-spanning cage cannot silently return;
- GitHub Actions now runs `office:shots` and uploads `office-visual-acceptance`
  after renderer smoke for visual Office changes.

Visual review evidence:

- the #1627 artifact contained 24 PNG captures covering Commons / Build /
  Strategy, morning / day / evening / night, and desktop 1440x1000 / mobile
  390x844 viewports, plus renderer metrics;
- the desktop matrix and representative mobile captures were manually inspected
  before merge;
- the cage/grid regression is absent across the inspected matrix;
- furniture and characters are materially more readable because the camera is
  closer and the decorative framing no longer crosses the room;
- night scenes are darker/cooler and no longer dominated by the previous orange
  key or neon rails;
- mobile remains a focused/cropped isometric presentation rather than a full-room
  overview; broader device-specific composition work remains part of the later
  browser/device QA phase and is not falsely claimed complete here.

## Current product value loop

```text
Describe outcome
  -> Plan / requirements / team
  -> explicit promotion
  -> isolated agent work
  -> verification + review
  -> human result decision
  -> managed local delivery
  -> ACCEPTED / change dossier / KPI
```

Technical `COMPLETED` and human `DELIVERED` remain distinct.

## Dependency / release-hardening lane

Dependency updates remain isolated from active RC1 product work.

```text
#53 httpx        historical verify #1596 SUCCESS — requires fresh latest-main verification
#54 three.js     historical verify #1597 SUCCESS — renderer-impacting; requires full latest-main visual/render verification
#55 pytest       historical verify #1598 SUCCESS — requires fresh latest-main verification
#56 ruff         historical verify #1599 SUCCESS — requires fresh latest-main verification
#57 setuptools   historical verify #1600 SUCCESS — requires fresh latest-main verification
#58 uvicorn      historical verify #1601 SUCCESS — runtime-impacting; requires fresh latest-main verification
#59 frontend dev verify #1602 FAILURE — npm ERESOLVE: TypeScript 7 is outside typescript-eslint 8.71 peer range
```

Historical green runs against an older `main` do not authorize a current merge.
#59 remains genuinely blocked and must not be bypassed with `--force` or
`--legacy-peer-deps`.

## Known limitations that remain explicit

Agent Office is not yet claiming enterprise-complete:

- multi-user identity / SSO / RBAC / separation of duties;
- multi-tenant cloud isolation;
- automatic Git provider push / PR / merge from Agent Office runtime behavior;
- webhook/email/chat notification transport;
- automatic retention/worktree cleanup;
- a second production executor;
- a generic cross-domain business-workflow step model;
- Three.js fallback retirement;
- a custom first-party production environment/character asset pack;
- deterministic pixel/image-diff visual baselines;
- completed cross-browser/device visual-regression matrix and adaptive-quality
  release gate.

## Next RC1 checkpoint

```text
Agent Office RC1 — Composer-First Zero-Friction UX
accepted base: main@b132e4667b0ef24c6c89053af939a1b04efa2d89
scope: make Composer the primary low-friction entry point while preserving explicit promotion and canonical workflow truth
status: READY after this milestone-sync PR itself passes exact-head CI and merges
```

The next product slice may resume because the visual composition regression is
now corrected and explicitly guarded. It should reduce user setup/form burden
and improve outcome-first interaction, project/context selection, plan preview,
and handoff into the existing Task/Run lifecycle without silently starting
high-risk work, inventing requirements, auto-approving, auto-delivering, or
bypassing human promotion/decision boundaries.

Remaining sequence:

```text
Composer-First Zero-Friction UX
  -> Decision Inbox / Board / KPI / Dossier polish
  -> adaptive quality / performance
  -> deterministic visual regression + browser/device QA
  -> dependency hardening on latest main
  -> RC1 release packaging / rollback evidence
```

Every merged visual checkpoint must include exact-head functional verification
and inspected screenshot evidence. Passing renderer smoke alone is no longer
sufficient visual acceptance.
