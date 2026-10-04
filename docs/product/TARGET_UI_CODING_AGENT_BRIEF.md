# Target UI Coding Agent Brief

Use this brief when handing the target-UI program to Codex or another coding
agent. It is an execution contract, not permission to weaken `AGENTS.md`.

## Mission

Evolve Agent Office toward the approved seven-panel engineering-control-room
reference while preserving truthful state and existing product safety. Match the
reference's information architecture, hierarchy, density, spacing, card
structure, and interaction quality. Do **not** copy fictional sample data.

## Required context order

Before editing:

1. `AGENTS.md`
2. `.agents/skills/ao-milestone/references/current-phase.md`
3. `.agents/skills/ao-repo-map/references/repo-map.md`
4. `.agents/skills/ao-repo-map/references/contract-index.md`
5. `.agents/skills/ao-ui-quality/SKILL.md`
6. `docs/ux/TARGET_UI_OVERRIDE.md`
7. `docs/ux/TARGET_UI_PRODUCT_UX_PLAN.md`
8. `docs/product/TARGET_UI_IMPLEMENTATION_CHECKLIST.md`
9. relevant page/component/tests only after the above.

If any source conflicts with `AGENTS.md` or canonical code semantics, stop and
report the exact conflict. Never guess around it.

## Owner-approved decisions

- desktop primary navigation is a top bar;
- top-level order: Office, Board, Inbox, KPI, Projects;
- mobile uses a drawer/hamburger;
- owner marker is generic `Local owner`, never a fabricated identity;
- U1-U7 do not add Task priority, sequential keys, or Team schema;
- no Design zone until the Office world has a real Design zone;
- RC1 accepts premium stylized R3F. Blender/photorealism is optional U9;
- 2D target surfaces may use the scoped visual override in
  `TARGET_UI_OVERRIDE.md`.

## Truth boundary

Canonical records are:

```text
Task
Run
AgentRun
Event
Evidence
ResultReview
```

Planning truth may additionally use existing Composer/Requirement/TeamProposal
records where already canonical.

Never fabricate:

- progress percentages;
- idle-agent counts;
- health states not exposed by the relevant subsystem;
- names/emails/approvers;
- priority/team/task keys not in the domain;
- weather;
- screenshots as Evidence unless they are actually persisted Evidence;
- security/compliance certification;
- dialogue or work activity that did not occur.

If data is unavailable, render `—`, an explicit unavailable state, or omit the
component.

## Work sequence

Do not mix phases into one uncontrolled redesign.

```text
U0 -> U1 -> U2 -> U3 -> U4 -> U5 -> U6 -> U7
```

U8/U9 remain optional separate decisions.

### U0

Managed-delivery correction with real-Git regression/API coverage. Must merge
before U1.

### U1

Target shell only:

- scoped design override;
- `--ao-radius-lg`;
- desktop top navigation;
- More menu;
- client-only global Task/Run/AgentProfile search;
- global `+ New Task` using existing modal/API;
- Local owner marker;
- safe demo seed under `scripts/`;
- shell tests.

Do not redesign Board/Inbox/Task/KPI contents in U1.

### U2

Task Detail decision surface.

### U3

Six-column Board.

### U4

Decision Inbox.

### U5

Accepted-change KPI.

### U6

In-app Dossier.

### U7

Office HUD, zone navigator, factual activity/status, contextual focus card.

## Coding rules

- use existing components/API contracts before creating parallel abstractions;
- no new dependency unless the requirement cannot be met with the current stack
  and the cost is documented;
- prefer narrow, typed components and pure derived projections;
- no `any` unless an existing boundary forces it and the reason is explicit;
- no unrelated refactor;
- no large speculative architecture layer;
- keep search/filter/KPI derivation deterministic and testable;
- preserve deep links and all existing routes;
- frontend never directly writes backend persistence;
- never make camera motion/tab/filter/search selection emit workflow Events.

## Git rules

- one branch per phase/checkpoint;
- no direct writes to `main`;
- no force push;
- no history rewrite;
- no destructive cleanup commands;
- no runtime push/merge of a user's registered Project default branch;
- PR merge only with exact-head protection.

## Verification contract

Before a PR can merge:

1. the exact PR head has a GitHub Actions run;
2. runner jobs really start;
3. repository/backend/frontend steps are non-null and execute;
4. every required job passes;
5. visual phases emit screenshots at the required viewports;
6. screenshots are manually inspected;
7. PR head is re-confirmed immediately before merge;
8. merge uses the confirmed expected head SHA.

A GitHub infrastructure failure with `steps=null`, no runner logs, or failure
before actual job startup is **not** a test failure and is **not** green. Retry
when useful, but never bypass it.

## Required functional gate

```bash
./scripts/verify.sh
```

When diagnosing a failing phase, run the narrowest relevant tests first, then the
full gate before declaring the fix complete.

## Visual quality bar

The UI should feel like a professional engineering operations product rather
than a generated admin template:

- strong hierarchy;
- compact but readable typography;
- intentional negative space;
- restrained semantic color;
- no excessive glow/glass/gradient decoration;
- no clipped sixth Board column at 1440px;
- no mobile horizontal page overflow outside intentional Board column scrolling;
- no tiny unreadable metadata;
- primary human decision action is obvious;
- status and numbers remain traceable to canonical records.

## Definition of done

A phase is done only when code, tests, exact-head CI, visual evidence (when
applicable), documentation, and truthful-state review all agree. Do not announce
completion because the UI merely renders or because a PR is mergeable.
