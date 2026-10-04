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
- [x] add coding-agent execution brief (`docs/product/TARGET_UI_CODING_AGENT_BRIEF.md`).

### Tokens / CSS

- [x] add `--ao-radius-lg: 12px` to the active token layer (`frontend/src/styles/tokens.css`);
- [x] add a target-shell stylesheet loaded after existing product styles (`frontend/src/styles/target-ui-shell.css`);
- [x] desktop shell has no permanent left sidebar (removed/desktop-hidden; drawer only);
- [x] mobile drawer remains available;
- [x] no decorative gradient is introduced to 2D decision surfaces;
- [x] visible `:focus-visible` treatment for top-nav/search/menu/buttons;
- [x] `prefers-reduced-motion` covered.

### Desktop top bar

- [x] brand + compact AO mark;
- [x] primary routes in exact order: Office, Board, Inbox, KPI, Projects;
- [x] active route uses `aria-current="page"`;
- [x] More menu exposes all remaining `NAV_ITEMS` routes;
- [x] compact factual backend health status;
- [x] generic `Local owner` affordance only;
- [x] mobile hamburger remains keyboard accessible.

### Global search

Client-only, no search backend/index.

- [x] lazy-load Projects, Tasks, Runs, AgentProfiles;
- [x] minimum query threshold avoids unnecessary N+1 calls;
- [x] cache loaded search projection for the session;
- [x] search Task title/id -> `/tasks/:id`;
- [x] search Run id/status/task title -> `/runs/:id`;
- [x] search role/profile -> `/agents`;
- [x] empty/unavailable registries degrade to no results, not fake entries;
- [x] keyboard-operable results list;
- [x] Escape closes result panel;
- [x] result click clears query and navigates.

### Global New Task

- [x] reuse `CreateTaskModal`;
- [x] load active Projects through existing API;
- [x] create through existing `api.createTask`;
- [x] after success navigate to canonical `/tasks/:id`;
- [x] no hidden Run creation or execution start.

### Demo seed

- [x] copy demo seeding concept into `scripts/seed_ui_demo.py`;
- [x] PUBLIC HTTP API only for Agent Office records;
- [x] temporary/local Git repository only;
- [x] no `shell=True` command interpolation;
- [x] no destructive `rm -rf` reset;
- [x] refuse unsafe/existing destination unless explicitly empty;
- [x] use Enterprise Engineering workflow as documented;
- [x] accepted records rely on fixed real managed delivery.

### U1 tests

- [x] shell landmarks and top nav;
- [x] primary route order;
- [x] More contains low-frequency routes;
- [x] active route `aria-current`;
- [x] Local owner contains no person/email data;
- [x] New Task opens existing modal and routes after success;
- [x] search matches Task/Run/AgentProfile with mocked canonical API data;
- [x] no desktop sidebar dependency in Office tests;
- [x] existing Office, Inbox, Board, KPI routes remain reachable.

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
