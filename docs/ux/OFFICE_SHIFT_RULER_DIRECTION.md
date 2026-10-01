# Agent Office /office Direction — Planning, Shift Ruler, and Truth Lines

Status: Owner-approved UX override  
Effective from: Phase 10H-1  
Scope: `/office` and the shared Agent Office shell used by Planning, Live, and Replay

## Authority and precedence

This document adapts the owner-provided Shift Ruler direction to the current
Agent Office architecture.

For `/office` presentation and interaction details, this document supersedes
older UI-specific wording when they conflict.

It does **not** supersede:

- canonical Task / Run / RunStage / AgentRun truth;
- Workspace Git worktree semantics;
- workflow, executor, Evidence, Finding, or audit contracts;
- Office View truthfulness and safety invariants.

Internal identifiers may remain compatible while visible product vocabulary is
updated.

## Product vocabulary

Visible Agent Office scopes are:

```text
Planning
Live
Replay
```

The existing internal scope key `workspace` and route `/office` remain for
compatibility. They must not be renamed into the Git `Workspace` domain.

`Workspace` continues to mean a canonical isolated execution workspace /
worktree in the domain model.

Navigation group copy should avoid using `Workspace` as a generic UI label.

## Truth adaptation for this repository

The Planning scope is not limited to planning-only personas.

Phase 10G established a truthful layered model:

```text
canonical WORK presence   <- Task / Run / AgentRun
PLANNING presence         <- durable planning records
AMBIENT presence          <- presentation-only office world
```

Planning may therefore show canonical active work when it exists, while keeping
planning and ambient truth visibly distinct.

Presence never upgrades into execution merely because it appears in the Office.

## Visual rules

Only factual truth emphasis and the later Shift Ruler should carry strong visual
weight.

The rest of the shell should remain calm and dense.

For the updated Office shell:

- use existing design tokens;
- use at most `--ao-radius-sm` for new or touched containment;
- no decorative gradients;
- no glassmorphism;
- no decorative panel shadows;
- prefer separators, rhythm, and semantic text over nested cards;
- preserve semantic colors for actual state;
- keep the Three.js Office visually dominant.

## Phase 10H-1 — Vocabulary and structure

This phase changes structure only.

### Top control rail

Keep one compact product rail containing:

- Agent Office identity;
- selected Project;
- factual mode/status context;
- `Planning / Live / Replay` as text controls with underline state;
- compact factual actions such as `+ Task`, Run controls, and Maximize.

The scope switcher is not a segmented-card control.

### Contextual operations Docket

The right rail remains a shared factual Docket.

Rules:

- Discussion is the default view;
- Details, Files, and Logs render only when their canonical source data exists;
- no empty tabs solely to preserve a four-tab shape;
- Composer input sits at the bottom of the Planning discussion flow;
- Project/thread/intent/executor controls may collapse into secondary Context;
- creating a Task uses the existing `CreateTaskModal`;
- no permanent inline task-creation form.

### Operations Dock

The Planning Operations Dock defaults open in normal state.

It may still be forced compact by Maximize because that is presentation-only.

The Tasks view should expose compact factual Task / latest Run / state
relationships when known. `No run yet` is a valid state and must not be
inferred into execution.

## Phase 10H-2 — Read-only Shift Ruler

Not part of Phase 10H-1.

The first ruler implementation must be read-only.

Rules:

- one lane per canonical Run;
- derive stage bars only from factual `RunStage.started_at` and
  `RunStage.completed_at`;
- do not estimate missing stage time;
- show `time unavailable` when timing truth is absent;
- derive the visible time axis from factual data rather than a hard-coded
  workday;
- cap visible lanes and provide a bounded overflow treatment;
- current AgentRun stage/status may be shown as present-state truth but must not
  be converted into invented historical duration.

## Phase 10H-3 — Truth lines

Not part of Phase 10H-1.

The visual language may distinguish:

- canonical WORK;
- durable PLANNING;
- AMBIENT presentation.

Any line, stroke, or legend must describe truth source rather than implying
progress.

## Replay scrubbing

Replay ruler scrubbing is a separate go/no-go decision after the read-only ruler
and truth-line phases are verified.

Replay remains canonical historical projection and must not mutate execution.

## RAG / context boundary

Do not display fake retrieval provenance such as `Context: 0` or fabricated
sources.

RAG/context provenance may be shown only after canonical retrieval records prove
what source material was supplied to an AgentRun.

Never expose private chain-of-thought.

## Phase discipline

One phase equals one PR:

```text
10H-1  vocabulary + structure
10H-2  read-only Shift Ruler
10H-3  truth lines
future replay scrubbing only after explicit go/no-go
```

Do not combine later phases into an earlier PR.
