# Agent Office Target UI — Technical Implementation Checklist

## Non-negotiable invariants

- `AGENTS.md` wins over this checklist.
- Canonical truth remains Task / Run / AgentRun / Event / Evidence / ResultReview.
- Frontend filtering, camera movement, tab selection, search, and layout changes
  never create business Events.
- No fabricated KPI, progress, status, health, activity, identity, or compliance.
- No force push, no CI bypass, no runtime auto-push/merge of a user's Project
  default branch.
- Every merge uses exact-head protection after a real GitHub Actions run whose
  repository/backend/frontend jobs actually start and pass.

## U0 — managed delivery correction

- [x] replace missing accepted-ref probe with `git rev-parse --verify --quiet`;
- [x] add real-Git adapter tests;
- [x] add API-level `approve-and-deliver` regression through the real adapter;
- [x] run exact-head CI;
- [x] merge only after all real steps pass.

## U1 — shell / information architecture

### Governance

- [x] add `docs/ux/TARGET_UI_OVERRIDE.md`;
- [x] record product decisions: top bar, Local owner, no Task priority/team/schema,
  no fake Design zone, stylized RC1 hero;
- [x] add Product/UX plan;
- [x] add this implementation checklist;
- [ ] add coding-agent execution brief.

### Tokens / CSS

- [ ] add `--ao-radius-lg: 12px` to the active token layer;
- [ ] add a target-shell stylesheet loaded after existing product styles;
- [ ] desktop shell must have no permanent left sidebar;
- [ ] mobile drawer remains available;
- [ ] no decorative gradient is introduced to 2D decision surfaces;
- [ ] visible `:focus-visible` treatment for top-nav/search/menu/buttons;
- [ ] `prefers-reduced-motion` covered.

### Desktop top bar

- [ ] brand + compact AO mark;
- [ ] primary routes in exact order: Office, Board, Inbox, KPI, Projects;
- [ ] active route uses `aria-current="page"`;
- [ ] More menu exposes all remaining `NAV_ITEMS` routes;
- [ ] compact factual backend health status;
- [ ] generic `Local owner` affordance only;
- [ ] mobile hamburger remains keyboard accessible.

### Global search

Client-only, no search backend/index.

- [ ] lazy-load Projects, Tasks, Runs, AgentProfiles;
- [ ] minimum query threshold avoids unnecessary N+1 calls;
- [ ] cache loaded search projection for the session;
- [ ] search Task title/id -> `/tasks/:id`;
- [ ] search Run id/status/task title -> `/runs/:id`;
- [ ] search role/profile -> `/agents`;
- [ ] empty/unavailable registries degrade to no results, not fake entries;
- [ ] keyboard-operable results list;
- [ ] Escape closes result panel;
- [ ] result click clears query and navigates.

### Global New Task

- [ ] reuse `CreateTaskModal`;
- [ ] load active Projects through existing API;
- [ ] create through existing `api.createTask`;
- [ ] after success navigate to canonical `/tasks/:id`;
- [ ] no hidden Run creation or execution start.

### Demo seed

- [ ] copy demo seeding concept into `scripts/seed_ui_demo.py`;
- [ ] PUBLIC HTTP API only for Agent Office records;
- [ ] temporary/local Git repository only;
- [ ] no `shell=True` command interpolation;
- [ ] no destructive `rm -rf` reset;
- [ ] refuse unsafe/existing destination unless explicitly empty;
- [ ] use Enterprise Engineering workflow as documented;
- [ ] accepted records rely on fixed real managed delivery.

### U1 tests

- [ ] shell landmarks and top nav;
- [ ] primary route order;
- [ ] More contains low-frequency routes;
- [ ] active route `aria-current`;
- [ ] Local owner contains no person/email data;
- [ ] New Task opens existing modal and routes after success;
- [ ] search matches Task/Run/AgentProfile with mocked canonical API data;
- [ ] no desktop sidebar dependency in Office tests;
- [ ] existing Office, Inbox, Board, KPI routes remain reachable.

## U2 — Task Detail

- [ ] move Request Changes / Approve Result to header;
- [ ] enable only from `can_request_changes` / `can_approve`;
- [ ] show disabled reason when unavailable;
- [ ] Task summary card: status/id/title/objective/requirements/agents/base revision;
- [ ] implement five visual steps: Plan, Work, Verify, Review, Deliver;
- [ ] document mapping from detailed canonical lifecycle to five-step view;
- [ ] Changes / Findings / Evidence / Checks / Timeline tabs with factual counts;
- [ ] file +/- only from captured change summary;
- [ ] verification table from recorded command, exit code, duration;
- [ ] remove stale "next human gate" copy once delivered;
- [ ] keyboard and narrow-layout tests.

## U3 — Task Board

- [ ] six canonical columns visible at 1440px;
- [ ] 1024/390 use horizontal column scrolling rather than clipping;
- [ ] Project + Status filters;
- [ ] client-side search;
- [ ] no Team filter without domain entity;
- [ ] no priority chip without domain field;
- [ ] factual AgentRun count/avatar mapping;
- [ ] read-only: no drag/drop status mutation;
- [ ] per-column semantic token accents + text labels.

## U4 — Inbox

- [ ] row layout rather than generic card grid;
- [ ] filters: All / Result Review / Approvals / Blocked;
- [ ] project proposed RequirementCandidate and pending TeamProposal into Approval;
- [ ] age from canonical timestamps;
- [ ] factual AgentRun count;
- [ ] no "mark all read";
- [ ] preserve "Nothing needs you" empty state.

## U5 — Accepted-change KPI

- [ ] 7D / 30D / 90D selector;
- [ ] daily accepted series from `delivered_at`;
- [ ] prior-window delta or `—` when no comparison base;
- [ ] Acceptance Rate from existing definition;
- [ ] Completion -> Delivery duration;
- [ ] Time to Decision, not fake human-minutes metric;
- [ ] average Remediation Cycles;
- [ ] Board pipeline overview counts;
- [ ] deterministic tests for timezone/window boundaries.

## U6 — Dossier viewer

- [ ] reuse existing dossier projection/export source;
- [ ] in-app sections: Overview / Changes / Verification / Evidence /
  Human Decisions / Timeline / Security facts;
- [ ] Download keeps existing Markdown export;
- [ ] phrase delivery as "Delivered to managed branch";
- [ ] approver identity omitted or generic Local owner only;
- [ ] Evidence types listed only when actually present;
- [ ] Security facts are facts, never compliance certification.

## U7 — Office HUD / focus interaction

- [ ] zone navigator: Reception, Engineering, QA, Strategy, Focus Rooms,
  Game Room, Pantry, Lounge;
- [ ] no Design zone until a real zone exists;
- [ ] zone click only moves/focuses camera;
- [ ] office clock + day/night mode, no weather;
- [ ] active AgentRun counts by canonical status, no fake idle count;
- [ ] recent redacted AgentEvent activity;
- [ ] executor health and latest managed delivery only for System Status;
- [ ] focused Task/Run card with `N of M stages` instead of percentage;
- [ ] Open Task / Watch Run only when canonical targets exist;
- [ ] only render focus-card tabs backed by data.

## Visual regression program

Extend the existing Playwright capture harness incrementally:

- [ ] `/office`
- [ ] `/board`
- [ ] `/inbox`
- [ ] `/tasks/:id`
- [ ] `/kpi`
- [ ] dossier viewer route/surface

For every target-UI phase capture at least:

```text
1440px desktop
1024px compact desktop/tablet
390px mobile
```

A capture command succeeding is not visual acceptance. Inspect the images for
clipping, hierarchy, text overlap, inaccessible controls, fake values, and
regressions against the target information architecture.

## Full gate

```bash
./scripts/verify.sh
```

Equivalent explicit checks include:

```bash
cd backend
pytest
ruff check .
ruff format --check .
mypy src

cd ../frontend
npm test -- --run
TZ=UTC npm test -- --run
npm run typecheck
npm run lint
npm run build

git diff --check
```

Infrastructure runs with missing steps/logs never count as green.
