# Agent Office Target UI — Product & UX Plan

## Product intent

The target UI evolves Agent Office from a collection of operational pages into a
cohesive **engineering control room**. The reference mockup defines hierarchy,
layout, density, and interaction patterns; it does not define product truth.
Every visible number, state, person, activity, and decision remains derived from
canonical Agent Office records.

## Experience principles

1. **Office first.** The 3D Office is the primary visual workspace, not a
   decorative landing page.
2. **Composer first.** Users describe an outcome before navigating registries or
   configuring implementation details.
3. **Human gates are obvious.** Anything waiting for a person is surfaced in
   Inbox and Task Detail without inventing urgency.
4. **One truth, many views.** Board, KPI, Dossier, Office overlays, and Task
   Detail are projections of the same Task/Run/AgentRun/Event/Evidence/
   ResultReview records.
5. **Dense, not noisy.** The product may show more information than the current
   shell, but secondary controls are collapsed into context menus, tabs, and
   progressive disclosure.
6. **Premium dark control-room language.** Near-black/navy surfaces, restrained
   semantic accents, readable typography, strong spacing rhythm, and deliberate
   card hierarchy. Avoid generic AI dashboard decoration.

## Primary navigation

Desktop top bar, in this order:

```text
Agent Office | Office | Board | Inbox | KPI | Projects | Search | + New Task | status | Local owner
```

Lower-frequency routes remain available under **More** and in the mobile drawer.
No route is removed.

## Core journeys

### Outcome to execution

```text
Office Composer
  -> planning thread
  -> requirement/team/workflow proposal
  -> explicit promotion
  -> Task + Run
  -> AgentRuns / stages
  -> verification and review
  -> human ResultReview
  -> managed local delivery
  -> Accepted change / KPI / Dossier
```

The UI never collapses technical `COMPLETED` and human `DELIVERED` into the same
state.

### Needs-your-decision journey

```text
Inbox
  -> decision row
  -> Task Detail
  -> evidence / changes / verification / timeline
  -> Approve Result OR Request Changes
  -> updated canonical ResultReview projection
```

### Observe active work

```text
Office
  -> factual active-agent summary
  -> live Event activity
  -> focused Task/Run card
  -> Watch Run
  -> Live / Replay Office
```

## Target surfaces

### A. Office hero

Retain premium stylized R3F Office. Add a zone navigator, factual active-agent
summary, recent Event activity, executor/delivery status, and contextual
Task/Run focus card. Camera movement is presentation state only.

No weather, fabricated idle count, fictional health subsystem, or simulated work
is shown as operational truth.

### B. Focus card

Show canonical status, short Task id, title/objective summary, factual active
AgentRun count, and `N of M stages` rather than a fake progress percentage.
Available actions are **Open Task** and **Watch Run** when their underlying
records exist.

### C. Task Detail

Become the human decision command surface:

- primary decision actions in the page header;
- Task context card;
- live five-step visual path: Plan / Work / Verify / Review / Deliver;
- tabbed Changes / Findings / Evidence / Checks / Timeline;
- verification commands with recorded exit code and duration;
- no unsupported test-count parsing.

### D. Task Board

Six read-only columns:

```text
Planning | Ready | Running | In Review | Needs You | Accepted
```

All six must fit at 1440px. Smaller screens use horizontal scrolling. Filters are
Project, Status, and search. Team/priority stay absent until explicitly added to
the domain.

### E. Inbox

Row-based, high-signal decision list with filters for:

- All
- Result Review
- Approvals
- Blocked

Approvals are projected from existing proposed planning records; no backend
schema change is required. There is no fake read/unread state.

### F. Accepted-change KPI

Provide 7D/30D/90D windows, daily accepted-change series, prior-window deltas,
Acceptance Rate, Completion -> Delivery, Time to Decision, Remediation Cycles,
and Board pipeline counts. Empty or unmeasurable values render `—`.

### G. Accepted Change Dossier

Add an in-app read-only viewer from the same projection used by Markdown export:
Overview, Changes, Verification, Evidence, Human Decisions, Timeline, and
Security facts. Delivery language must say **Delivered to managed branch**;
Agent Office does not claim it merged user branches.

## Responsive requirements

### 1440px

- top navigation fully visible;
- all six Board columns visible without clipping;
- Task Detail uses balanced two/three-column information hierarchy;
- KPI and Dossier preserve dashboard density.

### 1024px

- top nav remains usable with lower-frequency items under More;
- Board may horizontally scroll;
- Task Detail stacks supporting panels after primary decision content;
- Office overlays avoid covering the main focal workspace.

### 390px

- hamburger + brand + essential actions only in top bar;
- search becomes a full-width overlay/panel;
- decision actions remain reachable without horizontal page overflow;
- Board scrolls horizontally by column;
- no canonical content is visually clipped.

## Accessibility

- semantic landmarks remain intact;
- status is not color-only;
- keyboard focus is visible;
- dialogs restore focus correctly;
- popovers/menus are operable by keyboard;
- reduced-motion users receive no non-essential pulsing or camera animation;
- contrast is reviewed against the actual dark theme, not inferred from the
  reference image.

## Delivery sequence

```text
U0  managed-delivery real-Git correction
U1  target visual override + top shell + search + New Task + safe demo seed
U2  Task Detail
U3  Task Board
U4  Inbox
U5  KPI
U6  Dossier viewer
U7  Office HUD / zone navigation / focus card
U8  optional Task key / priority / Team domain extension
U9  optional Blender-authored hero asset lane
```

U1-U7 are expected to remain frontend-only except where an existing canonical
endpoint is consumed differently. U8 requires a separate ADR and schema/domain
approval.

## Acceptance definition

A target-UI phase is complete only when:

- repository/backend/frontend CI jobs actually start and pass;
- no `steps=null` infrastructure failure is counted as evidence;
- functional tests cover the changed interaction;
- screenshot evidence exists at 1440px, 1024px, and 390px where the harness
  supports the route;
- screenshot output is visually inspected rather than accepted solely because
  rendering succeeded;
- every displayed value can be traced to a canonical record or is intentionally
  shown as unavailable.
