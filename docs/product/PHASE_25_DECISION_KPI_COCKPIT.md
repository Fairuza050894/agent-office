# Phase 25 — Decision & KPI Cockpit

## Status

**COMPLETE / MERGED**

```text
PR: #52
exact verified head: 6d065cb52586c2830ce3a426258c5a46f3770d93
GitHub Actions verify #1593: SUCCESS
merge commit: 8c6f94d259be27093b02d9017dbb1722bd956d31
```

Acceptance evidence is a real exact-head GitHub-hosted run: frontend tests/typecheck/lint/build, production dependency audit, Office production guard, Chromium Planning/Live/Replay R3F smoke, backend full verification, and repository whitespace verification all passed before merge.

## Goal

Make the commercial value loop immediately legible to operators and stakeholders:

```text
work exists
  -> work needs a decision
  -> human accepts the result
  -> managed delivery is recorded
  -> accepted change is visible as a KPI
```

The checkpoint changes visual hierarchy only. It does not alter how Task, Run, ResultReview, Board columns, Inbox decisions, or accepted-change metrics are calculated.

## Delivered

### Accepted Change North Star

The existing factual Accepted Change KPI surface now receives a distinct executive hierarchy:

- accepted changes in the last seven days is the primary outcome card;
- all accepted changes, acceptance rate, and average acceptance time remain supporting facts;
- technical Run metrics remain visually secondary;
- no individual agent/person productivity ranking is added.

### Human decision Inbox

The existing canonical Inbox is presented as an action queue rather than a generic dashboard section:

- each item remains derived from `decisionText(...)` and canonical state;
- `Needs you` retains a restrained attention treatment;
- links still open the Task decision surface;
- no background action or automatic decision is introduced.

### Task Board

The six existing read-only columns remain:

```text
Planning
Ready
Running
In review
Needs you
Accepted
```

The new presentation visually distinguishes human-attention and accepted-delivery states while keeping drag-and-drop disabled. CSS styling does not move Tasks or derive any new status.

## Truth boundary

Phase 25 does not:

- modify `columnFor(...)`;
- modify `decisionText(...)`;
- modify accepted-change metric calculation;
- turn technical `COMPLETED` into `DELIVERED`;
- auto-approve, auto-deliver, push, or merge;
- infer a person's or agent's quality/productivity;
- add fabricated counts or trend data.

## Implementation boundary

```text
frontend/src/styles/product-cockpit.css
frontend/src/App.tsx
```

Existing Decision Center and KPI tests remain the behavioral regression contract.

## Acceptance gates

```text
frontend tests / typecheck / lint / build: PASS
production dependency audit: PASS
production Office guard: PASS
Chromium Planning / Live / Replay smoke: PASS
backend full verification (stack integration): PASS
repository whitespace verification: PASS
```
