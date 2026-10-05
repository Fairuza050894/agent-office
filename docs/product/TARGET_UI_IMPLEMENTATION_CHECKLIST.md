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

- [x] move Request Changes / Approve Result to header;
- [x] enable only from `can_request_changes` / `can_approve`;
- [x] show disabled reason when unavailable;
- [x] Task summary card: status/id/title/objective/requirements/agents/base revision;
- [x] implement five visual steps: Plan, Work, Verify, Review, Deliver;
- [x] document mapping from detailed canonical lifecycle to five-step view (`docs/product/TARGET_UI_TASK_DETAIL_MAPPING.md`);
- [x] Changes / Findings / Evidence / Checks / Timeline tabs with factual counts;
- [x] file +/- only from captured change summary;
- [x] verification table from recorded command, exit code, duration;
- [x] remove stale "next human gate" copy once delivered;
- [x] keyboard and narrow-layout tests.

## U3 — Task Board

- [x] six canonical columns visible at 1440px;
- [x] 1024/390 use horizontal column scrolling rather than clipping;
- [x] Project + Status filters;
- [x] client-side search;
- [x] no Team filter without domain entity;
- [x] no priority chip without domain field;
- [x] factual AgentRun count/avatar mapping;
- [x] read-only: no drag/drop status mutation;
- [x] per-column semantic token accents + text labels.

## U4 — Inbox

- [x] row layout rather than generic card grid;
- [x] filters: All / Result Review / Approvals / Blocked;
- [x] project proposed RequirementCandidate and pending TeamProposal into Approval;
- [x] age from canonical timestamps;
- [x] factual AgentRun count;
- [x] no "mark all read";
- [x] preserve "Nothing needs you" empty state.

## U5 — Accepted-change KPI

- [x] 7D / 30D / 90D selector;
- [x] daily accepted series from `delivered_at`;
- [x] prior-window delta or `—` when no comparison base;
- [x] Acceptance Rate from existing definition;
- [x] Completion -> Delivery duration;
- [x] Time to Decision, not fake human-minutes metric;
- [x] average Remediation Cycles;
- [x] Board pipeline overview counts;
- [x] deterministic tests for timezone/window boundaries.

## U6 — Dossier viewer

- [x] reuse existing dossier projection/export source;
- [x] in-app sections: Overview / Changes / Verification / Evidence /
  Human Decisions / Timeline / Security facts;
- [x] Download keeps existing Markdown export;
- [x] phrase delivery as "Delivered to managed branch";
- [x] approver identity omitted or generic Local owner only;
- [x] Evidence types listed only when actually present;
- [x] Security facts are facts, never compliance certification.

## U7 — Office HUD / focus interaction

- [x] zone navigator: Reception, Engineering, QA, Planning (= Strategy floor,
  labeled Planning to avoid duplicating the L3 Strategy floor chip),
  Focus Rooms, Game Room, Pantry, Lounge;
- [x] no Design zone until a real zone exists;
- [x] zone click only moves/focuses camera;
- [x] office clock + day/night mode, no weather;
- [x] active AgentRun counts by canonical status, no fake idle count;
- [x] recent redacted AgentEvent activity;
- [x] executor health and latest managed delivery only for System Status;
- [x] focused Task/Run card with `N of M stages` instead of percentage;
- [x] Open Task / Watch Run only when canonical targets exist;
- [x] only render focus-card tabs backed by data.

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
