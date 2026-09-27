# Living 3D Agent Office — Product Requirements Document

Status: Draft implementation contract  
Branch: `phase-10-living-office`  
Product surface: `/office`

## 1. Product vision

Agent Office should feel like a small engineering startup with a visible team and a daily office rhythm, not like a dashboard with decorative avatars.

The 3D Office remains the primary visual surface. Universal Composer and the Operations Dock remain below it. The global application sidebar may collapse to maximize the Office, but the Living Office does not add permanent left/right operational rails.

Core experience:

> Opening Agent Office should feel like entering a working virtual engineering office whose visible behavior is grounded in real planning and execution state.

## 2. Goals

1. Create believable team presence with distinct roles, locations, and activity states.
2. Give the office a daily rhythm: arrival, focus work, lunch, coffee breaks, quiet/prayer windows, wrap-up, and after-hours ambience.
3. Map factual planning and execution state into visible office activity.
4. Keep ambient behavior separate from canonical operational truth.
5. Support multiple floors without rendering the whole building at full detail simultaneously.
6. Preserve a low-noise professional startup atmosphere rather than turning the product into a game.

## 3. Truth model

The Office has three layers:

### Canonical truth

Authoritative product facts:

- Task
- Run
- AgentRun
- Workspace
- Event
- Finding / Evidence
- ComposerThread
- PlanningEvent
- TeamProposal
- RequirementCandidate
- PlanningArtifact

### Derived office state

A presentation mapping from canonical truth into meaningful office behavior, for example:

- active planning -> planning room
- awaiting user -> waiting state
- active implementation -> engineering desk
- testing -> QA bench
- review -> review wall
- documentation -> documentation desk

### Ambient behavior

Presentation-only behavior derived from configured office time and schedule:

- arrival
- lunch
- coffee break
- quiet/prayer break
- social break
- gaming
- after-hours

Ambient state must never claim repository-changing execution.

**Animation is never evidence. Presence is not execution.**

## 4. Office layout

The architecture must support N floors. Initial product floors:

### L1 — Commons

Purpose: arrival and everyday office ambience.

Zones:

- entrance
- coffee bar
- pantry
- lounge
- quiet room / prayer-compatible calm space
- game corner
- informal collaboration

### L2 — Build

Purpose: engineering production.

Zones:

- engineering pod
- QA/test bench
- review wall
- documentation desk
- integration / ops stations
- shared pairing area

### L3 — Strategy

Purpose: planning and architecture.

Zones:

- planning table
- architecture wall
- decision room
- product/design review
- project alignment / war-room use when grounded by an actual event

Future optional floor:

### Rooftop / breakout

Reserved for low-priority ambient social/cooldown use. Not required for the foundation release.

## 5. Navigation

Floor switching occurs inside `/office`, not through separate application pages.

Initial selector:

- L1 Commons
- L2 Build
- L3 Strategy

Changing floor changes the rendered environment and visible team members while preserving Composer and Operations Dock state.

## 6. Presence model

### Work state

Grounded state derived from product truth:

- IDLE
- PLANNING
- IMPLEMENTING
- TESTING
- REVIEWING
- DOCUMENTING
- WAITING_USER
- BLOCKED
- COMPLETED

### Presence state

Physical presentation:

- ARRIVING
- AVAILABLE
- WORKING
- PLANNING
- WAITING_USER
- LUNCH_BREAK
- COFFEE_BREAK
- SOCIAL_BREAK
- OFFLINE

Future schedule provider may add:

- PRAYER_BREAK

The visual state must not imply a stronger work claim than the canonical state supports.

## 7. Priority rules

When multiple potential activities overlap:

1. safety / critical operational event
2. active canonical work
3. user decision / planning meeting
4. configured schedule event
5. ambient routine

A coffee or social rule must not interrupt factual critical work.

## 8. Time-driven ambience

The foundation may use deterministic local-office windows for arrival, focus work, lunch, coffee, wrap-up, and after-hours.

Prayer ambience must **not** be implemented with permanently hard-coded prayer times. It requires a configurable schedule/provider and explicit office settings.

The target model is:

```text
office timezone
      +
office schedule
      +
optional prayer schedule provider
      +
canonical project state
      ↓
Office Presence Resolver
      ↓
3D presentation
```

## 9. Event-driven behavior

Examples:

- TeamProposal with INCLUDED planning roles -> those roles appear on L3 Strategy.
- ComposerThread AWAITING_USER -> planning members display Waiting for you.
- No planning or Run truth -> only ambient office presence may be shown.
- Future Run/AgentRun implementation -> relevant roles move to factual work zones.
- Future testing/review/documentation events -> QA/reviewer/writer move to their relevant stations.

DEFERRED or EXCLUDED planning roles must not visually appear as active project workers.

## 10. Role tendencies

Role behavior should differ by purpose, not by random dialogue.

- Product Manager -> planning / decision room
- System Analyst -> architecture / analysis area
- Principal Engineer -> architecture / review
- Product Designer -> design / decision review
- Backend Engineer -> engineering pod
- Frontend Engineer -> engineering pod
- QA Engineer -> QA bench
- Security Reviewer -> review wall
- Technical Writer -> documentation station

## 11. Performance rules

- Render one active floor at full detail.
- Do not animate non-visible floors at full fidelity.
- Avoid permanent animation loops when the scene is visually stable.
- Keep current local-first Three.js renderer and existing GLB asset pipeline unless a later measured need justifies a different architecture.

## 12. Operations Dock relationship

The 3D Office explains **what appears to be happening**.

The Operations Dock explains **what is factually recorded**.

The Dock remains below the Office and retains planning/operational evidence, decisions, requirements, risks, deferred work, and activity.

## 13. Configuration target

Future settings should support:

- office timezone
- working days / hours
- break ambience enabled
- prayer ambience enabled
- social/gaming ambience enabled
- animation density
- quiet/focus mode
- default floor

## 14. Foundation acceptance criteria

The foundation is complete when:

1. `/office` supports at least three floor definitions.
2. The user can switch floors without leaving `/office`.
3. Each floor has a visibly different functional layout.
4. INCLUDED planning-team roles can be rendered as planning presence without creating AgentRun.
5. AWAITING_USER is visually distinguishable from active planning.
6. When no planning team exists, ambient presence may be rendered but is explicitly presentation-only.
7. Operations Dock and Composer remain unchanged as the factual/action surfaces.
8. Existing operational Run Office behavior remains backward-compatible.
9. Tests verify floor definitions, planning-presence truth boundaries, and deterministic ambient scheduling.
