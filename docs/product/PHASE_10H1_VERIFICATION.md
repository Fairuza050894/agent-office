# Phase 10H-1 Verification — Vocabulary & Structure

Status: IMPLEMENTED / DRAFT VERIFICATION  
Base: `main@795b588`  
Branch: `phase-10h1-office-structure`

## Purpose

Apply the owner-approved /office structure direction without implementing the
Shift Ruler or truth-line phases early.

The canonical source for this phase is:

```text
docs/ux/OFFICE_SHIFT_RULER_DIRECTION.md
```

## Implemented

### Vocabulary

Visible Agent Office scope labels are now:

```text
Planning
Live
Replay
```

The internal `workspace` scope key remains for compatibility.

The canonical `Workspace` domain continues to mean an isolated execution
workspace / Git worktree.

### Top rail

- scope switcher is text + underline state rather than segmented cards;
- existing Project, Run, event connectivity, Run controls, and Maximize truth are
  preserved;
- `+ Task` is a compact factual action.

### Planning Docket

- Discussion remains primary;
- Details, Files, and Logs are omitted when their canonical source is absent;
- durable planning history and secondary Context controls sit before the input;
- Composer input/action is the bottom of the discussion flow;
- RUN intent is reviewed through the existing planning endpoint and does not
  directly start execution;
- permanent inline Task form is removed.

### Task creation

Both Planning and Run-scoped Office surfaces use the existing
`CreateTaskModal`.

Creating a Task creates Task truth only. No Run is started automatically.

### Operations Dock

Planning defaults to the normal/open Dock.

The Tasks tab renders:

```text
Task | latest Run | state
```

When no Run exists it says `No run yet` / `No run` instead of implying work.

Maximize may still force the Dock compact because maximize is presentation-only.

### Visual structure

Touched Office shell surfaces use existing tokens, small radius, separators, and
flat surfaces. The Phase 10H-1 overrides add no decorative gradient, glass, or
panel shadow.

## Preserved Phase 10G truth

Planning still supports three distinct truth layers:

```text
WORK      Task / Run / AgentRun
PLANNING  durable planning records
AMBIENT   presentation-only office world
```

This PR does not downgrade canonical WORK to decorative planning presence.

## Not implemented

- Shift Ruler;
- RunStage duration bars;
- truth-line visual grammar;
- Replay ruler scrubbing;
- fake RAG provenance;
- executor pause/checkpoint semantics.

## Required automated verification

```bash
cd ~/Projects/agent-office/frontend

npm test -- --run \
  src/App.test.tsx \
  src/pages/RunOfficePage.test.tsx \
  src/components/office/ContextualOperationsRail.test.tsx \
  src/components/office/BottomOperationsDock.test.tsx \
  src/components/office/UniversalComposerShell.test.tsx

npm run typecheck
npm run lint
npm run build

TZ=UTC npm test -- --run
TZ=Asia/Jakarta npm test -- --run

cd ~/Projects/agent-office
./scripts/verify.sh
git status --short
```

## Required rendered review

Do not mark this phase visually complete until screenshots are inspected at
approximately:

- 1440px desktop;
- 1024px compact desktop/tablet;
- 390–430px mobile.

Review hierarchy, density, 3D dominance, Docket width, composer ordering,
conditional tabs, Dock default state, modal task flow, responsive behavior, and
absence of card/gradient/shadow regression.

## Merge gate

The PR remains Draft until:

1. targeted frontend tests pass;
2. canonical `./scripts/verify.sh` passes;
3. UTC and Asia/Jakarta suites pass;
4. rendered review passes;
5. working tree is clean.

Merge remains manual.
