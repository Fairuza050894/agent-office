# Agent Office vNext — Product Concept / PRD

Status: Proposed
Version: 0.2
Working branch: `phase-9-concept`
Scope: post-Phase-8 product evolution
Implementation status: not started

---

## 1. Purpose

This document defines the product direction for the next evolution of Agent Office after the Phase 8 Office View milestone.

The goal is not to turn Agent Office into a decorative AI-company simulator. The goal is to make the product feel more premium, spatial, futuristic, and alive while preserving its strongest principle:

> if Agent Office cannot prove an operational activity happened, it must not present that activity as execution fact.

The proposed vNext experience combines three clearly separated truth modes and one universal interaction surface:

1. **Operational Mode** — factual engineering execution
2. **Ambient Idle Mode** — non-canonical office life when no engineering Run is active
3. **Brainstorm / Planning Mode** — explicit AI-assisted ideation with structured notes, requirements, decisions, and questions
4. **Universal Composer** — one project-aware entry point for Ask, Plan, Brainstorm, and Run intents

These modes may share the same virtual office environment and role identities, but they must not share the same truth semantics.

vNext also changes the organizational model. Agent Office no longer assumes a fixed cast where every role participates in every request. It forms a temporary team based on the selected Project, requested intent, repository truth, risk, and implementation scope.

---

## 2. Product Problem

The current application is functionally strong but visually uneven.

The primary problems targeted by this concept are:

- the global white application shell looks generic and too similar to common AI-generated admin dashboards
- the Office View still sacrifices too much scene area to persistent log/detail UI
- the virtual office becomes visually static when there is no active work
- Office View has useful spatial zones but they are not yet used as meaningful interaction contexts
- brainstorming between roles is not represented as a first-class workflow
- notes, requirements, decisions, open questions, and brainstorm timestamps are not yet first-class product objects
- operational activity, illustrative ambience, and generated planning output need a clearer semantic boundary
- powerful controls such as scene focus, camera presets, minimap, command palette, and presentation mode are still missing

The next version should feel like an engineering command center with a living spatial layer rather than a white CRUD dashboard with a 3D widget attached.

---

## 3. Product Vision

Agent Office vNext should feel like:

> a dark engineering control room connected to a living virtual office where factual work, ambient presence, and structured AI planning are visually distinct but spatially coherent.

The user should be able to answer:

- What is running now?
- Which agents are factually working?
- What is blocked?
- What changed recently?
- What is being planned but not yet approved?
- What requirements came out of the latest brainstorm?
- What can I focus on without reading a large event table?
- What is simply ambient office behavior rather than operational execution?

The product should feel powerful even while idle, without implying work that did not occur.

---

## 4. Core Experience Model

### 4.1 Operational Mode

Operational Mode is the authoritative execution view.

It is active whenever the user is inspecting:

- a Run
- a factual AgentRun
- Historical replay
- Findings
- Evidence
- Tests
- Changes
- execution state

Operational Mode may visualize factual state, but it must not invent activity.

Examples:

```text
AgentRun STARTING  -> character walks to factual workstation
AgentRun RUNNING   -> character occupies factual workstation
AgentRun WAITING   -> character moves to factual waiting area
AgentRun BLOCKED   -> character moves to review / incident area
AgentRun COMPLETED -> character settles in terminal state
```

This mode continues to use backend Run / Stage / AgentRun / Event / Evidence truth.

### 4.2 Ambient Idle Mode

Ambient Idle Mode exists only to make the office feel inhabited when there is no active engineering Run in the selected scope.

Ambient movement is **not execution state**.

Possible ambient behavior:

- walk between safe office zones
- sit or stand in lounge areas
- stand near the pantry
- move toward a window
- enter or leave the meeting room
- two role personas face one another in a conversational stance
- inspect the whiteboard
- sit in a focus booth
- return to a workstation

Ambient behavior must be visibly labeled as non-operational.

Recommended visible mode indicator:

```text
AMBIENT OFFICE
No active Run
Illustrative office activity
```

Ambient behavior must never:

- create AgentRun records
- create canonical execution Events
- create fake Findings
- create fake Evidence
- imply tests are running
- imply code is being written
- imply a real meeting occurred
- display fabricated completion percentages
- fabricate dialogue

If two ambient personas appear to talk, the presentation is purely visual.

No generated conversation text is shown in Ambient Idle Mode.

### 4.3 Brainstorm / Planning Mode

Brainstorm Mode is an explicit user-started AI planning session.

This mode may contain generated ideas and multi-role discussion because the system is actually performing a planning activity initiated by the user.

However, generated material must be presented as:

- proposal
- draft
- question
- candidate requirement
- candidate decision
- risk
- assumption

It must not be presented as an already approved product requirement or engineering fact unless the user approves it.

Brainstorm Mode should visually use the meeting room / whiteboard area.

Example:

```text
User starts Brainstorm Session
        ↓
Agent Office proposes a Planning Cell
        ↓
Product Manager + Principal Engineer + System Analyst
+ Product Designer / QA / Security when relevant
        ↓
Structured proposal turns
        ↓
Notes appear on board
        ↓
Requirement candidates are grouped
        ↓
Open questions / risks are surfaced
        ↓
User approves / rejects / defers
        ↓
Approved items may become Task / PRD input
        ↓
Implementation team is formed only after scope approval
```

---

## 5. Visual Direction

### 5.1 Global Shell

The white shell should be replaced by a dark control-room visual system.

The product should not use pure black everywhere. The target is layered dark surfaces with strong information hierarchy.

Recommended foundation tokens:

```text
canvas       #081018
surface      #0E1822
surface-2    #14212D
surface-3    #192936
border       #243542
text         #E7EEF5
text-muted   #8CA0B3
cyan/live    #53C7F0
green/ok     #48C78E
amber/wait   #E3B341
red/error    #EF6A67
violet/plan  #A78BFA
```

The system should use:

- restrained gradients
- subtle depth
- thin separators
- small state glows where meaningful
- compact typography
- mono typography for IDs / timestamps / technical state
- stronger contrast around actionable controls

The system should avoid:

- giant rounded white cards
- generic hero gradients
- excessive pill UI
- oversized empty states
- decorative icon spam
- random neon borders
- large areas of unexplained whitespace
- repeated identical card grids

### 5.2 Surface hierarchy

The preferred hierarchy is:

```text
dark canvas
  ↓
structural surfaces
  ↓
operational panels
  ↓
selected/focused surface
  ↓
state accent
```

Color should communicate state, not decorate every component.

### 5.3 Office lighting

The office should retain zone-specific lighting:

- workspace: neutral cool
- meeting room: balanced warm-white
- pantry/cafe: warm amber
- game/recreation: restrained cyan/blue
- lounge/focus: soft warm neutral
- incident/review: more technical cool light

Lighting changes must not imply execution state unless explicitly tied to canonical state.

---

## 6. Office View Layout Evolution

### 6.1 Scene-first default

The 3D scene should become the dominant viewport.

The preferred vNext desktop composition is:

```text
FULL-WIDTH OFFICE / WORLD
        ↓
UNIVERSAL COMPOSER
        ↓
COLLAPSIBLE BOTTOM OPERATIONS DOCK
```

Target desktop behavior:

- Office scene consumes nearly the full content width
- normal bottom dock is approximately 220–280 px tall
- collapsed dock is approximately 44–56 px tall
- expanded dock may use approximately 35–40% of viewport height
- maximize mode can collapse the dock to a thin strip
- selected Agent detail remains transient / on-demand

The current Phase 8 persistent full-height right sidebar should not remain the default layout.

### 6.2 Bottom Operations Dock

The Operations Dock is the default home for high-frequency operational information.

Recommended structure:

```text
┌────────────────────────────────────────┬───────────────────────┐
│ ACTIVITY / FINDINGS / EVIDENCE         │ ACTIVE TEAM           │
│                                        │                       │
│ compact factual event stream           │ role + factual state  │
└────────────────────────────────────────┴───────────────────────┘
```

The dock should support tabs rather than displaying every information class simultaneously:

- Activity
- Team
- Findings
- Evidence
- Terminal / executor output when supported

Default Activity presentation:

- 3–8 recent canonical signals depending on dock height
- timestamp
- role/source
- short human-readable event
- subtle live indicator
- scroll when expanded
- no giant cards

The Team region should show only roles relevant to the current context. In an active Run this means instantiated AgentRuns. In planning it means the selected Planning Cell. In Ambient Mode it means OfficePersonas and must not use operational status language.

### 6.3 Universal Composer placement

The Universal Composer sits immediately above the Operations Dock or inside its upper rail.

It must remain accessible while the user watches the Office View.

Its compact context row may include:

```text
[Project] [Branch] [Mode] [Workflow] [Executor] [+ Context]
```

The composer is specified in detail in the Universal Composer section below.

### 6.4 Selected Agent inspector

Clicking a character or roster item should open a compact inspector containing:

- role
- canonical status
- stage
- executor
- workspace
- factual last activity
- IDs
- relevant Evidence / Findings shortcuts

The inspector may appear as:

- right drawer
- floating panel
- anchored panel beside the selected character

It should close without changing Run state.

### 6.5 Maximize / Focus Office

Office View should support a true maximize mode.

Recommended behavior:

- hide normal application navigation
- hide nonessential page chrome
- preserve top command rail
- preserve emergency/exit control
- expand 3D canvas to available viewport
- compact log remains optional
- Esc exits maximize mode

This mode is suitable for:

- long-running work monitoring
- demo
- second monitor
- presentation
- control-room usage

---

## 7. Ambient Idle Mode

### 7.1 Entry condition

Ambient Idle Mode may activate only when:

```text
selected scope has no active RUNNING / STARTING / WAITING Run
AND
user is not in Historical replay
AND
user is not in Brainstorm Mode
```

User must also be able to disable ambient behavior globally.

### 7.2 Ambient personas

Ambient characters represent role personas, not AgentRuns.

Recommended internal name:

```text
OfficePersona
```

An OfficePersona may reuse the deterministic visual identity of the vNext role catalog:

- Product Manager
- System Analyst
- Principal Engineer
- Product Designer
- Backend Engineer
- Frontend Engineer
- QA Engineer
- Security Reviewer
- Technical Writer

The UI must not show operational status pills such as RUNNING or COMPLETED for these personas.

### 7.3 Deterministic behavior

Ambient behavior should not be random on every render.

Recommended seed inputs:

- role key
- local calendar date
- office session identifier

This allows the office to feel varied without flickering or teleporting after rerender.

### 7.4 Ambient activity catalog

Allowed illustrative activities:

- workstation idle
- lounge idle
- pantry stance
- window stance
- focus booth
- whiteboard observation
- walking between zones
- two-person conversational stance
- seated lounge pose
- standing review-screen pose

Not allowed:

- fake code writing claims
- fake testing claims
- fake review outcomes
- fake issue discovery
- fake requirement approval
- fabricated conversation transcript

### 7.5 Transition back to factual work

When a factual Run starts:

1. Ambient Mode ends.
2. Ambient-only personas stop being authoritative visual actors.
3. factual AgentRun characters take precedence.
4. the UI switches to Operational Mode.
5. no ambient movement may be interpreted as the start of an AgentRun.

The transition should feel smooth but semantic priority belongs to backend state.

---

## 8. Brainstorm / Planning Mode

### 8.1 Starting a session

A user starts a session with:

- title
- objective / prompt
- optional Project
- optional existing Task
- optional context
- selected or suggested roles
- session timezone
- session date/time

Example:

```text
Brainstorm: Improve hiring workflow automation

Date:
2026-09-27 10:00 WIB

Participants:
Product Manager
Principal Engineer
System Analyst
QA Engineer
Technical Writer
```

### 8.2 Session header

A Brainstorm Session should always show:

- session title
- date
- local time
- timezone
- participants
- linked Project / Task if any
- session status

Suggested session states:

```text
DRAFT
ACTIVE
AWAITING_USER
COMPLETED
ARCHIVED
```

### 8.3 Structured output model

The system should not expose hidden chain-of-thought.

Agents produce concise, user-visible structured contributions.

Recommended objects:

#### BrainstormNote

- id
- session_id
- author_role
- note_type
- title
- content
- created_at
- source_turn_id

#### RequirementCandidate

- id
- session_id
- title
- problem
- requirement
- rationale
- acceptance_hint
- source_roles
- status
- created_at
- approved_at

Status:

```text
PROPOSED
APPROVED
REJECTED
DEFERRED
```

#### DecisionProposal

- decision
- options considered
- recommendation
- trade-offs
- status

#### OpenQuestion

- question
- owner / relevant role
- blocking flag
- resolution status

#### Risk

- risk
- likelihood description
- impact description
- mitigation proposal

#### ActionItem

- action
- proposed owner
- target context
- status

### 8.4 Spatial brainstorm presentation

When Brainstorm Mode starts:

- selected personas move to meeting room
- camera may ease toward the meeting area
- whiteboard becomes the primary planning surface
- notes appear as compact sticky-note-like items
- requirements appear in a structured side rail / board
- date/time remains visible
- the current speaker role may receive a subtle highlight

Important:

Character movement in Brainstorm Mode represents an actual active Brainstorm Session, not an engineering AgentRun.

### 8.5 Discussion presentation

Avoid fake chat-app theater.

Preferred presentation:

- one concise role contribution at a time
- summarized visible proposal
- generated artifact appears immediately in structured form
- discussion transcript is secondary
- final usable outputs are primary

Example:

```text
PRODUCT MANAGER
Proposal
Separate candidate screening from interview scheduling.

PRINCIPAL ENGINEER
Constraint
Scheduling must remain independent from screening state transitions.

→ Requirement candidate created
REQ-07 · Candidate screening orchestration
```

### 8.6 User control

The user must remain the approval authority.

The user can:

- approve requirement
- reject requirement
- defer requirement
- edit requirement
- pin note
- merge duplicate notes
- resolve open question
- ask a role to challenge a proposal
- ask for another round
- convert approved requirements into Task input
- export / attach session summary

No generated requirement becomes approved simply because multiple agents agree.

---

## 9. Universal Composer

### 9.1 Purpose

Universal Composer is the primary conversational and command entry point for Agent Office.

The user should not need to navigate through a multi-page form merely to ask about a Project, resume old work, start a planning session, or launch an approved implementation.

The composer accepts:

- Project scope
- user instruction
- optional repository context
- optional Run / Finding / Evidence context
- optional Workflow
- optional Executor
- intent

The composer must remain project-aware. Repository-changing work must target a registered Project rather than an arbitrary ungoverned filesystem path.

### 9.2 Supported intents

The composer supports five intent values:

```text
AUTO
ASK
PLAN
BRAINSTORM
RUN
```

#### AUTO

Default mode.

Agent Office classifies the request into ASK, PLAN, BRAINSTORM, or RUN.

AUTO may prepare an implementation proposal, but it must not silently begin repository-changing execution.

Before a RUN starts, the user must see the selected Project, approved scope, proposed execution team, Workflow, and Executor and explicitly start the Run.

#### ASK

Read-only question about selected Project context.

Examples:

- "What architecture does TDP use now?"
- "Where is authentication implemented?"
- "What did the last Run change?"

ASK does not create a Task or Run unless the user promotes the conversation.

#### PLAN

Repository-aware planning without implementation.

Use PLAN when:

- returning to a Project after a long gap
- requirements are unclear
- change impact must be discovered first
- implementation scope needs approval

PLAN should normally form a small Planning Cell rather than activate the full role catalog.

#### BRAINSTORM

Explicit multi-role ideation.

BRAINSTORM creates a BrainstormSession and structured planning artifacts.

It may use the meeting room spatially.

#### RUN

Creates an engineering Task/Run from sufficiently clear and approved scope.

RUN must not bypass required planning or approval gates merely because the user entered imperative language.

### 9.3 Composer interaction

Recommended compact layout:

```text
[Project: TDP ▼] [AUTO ▼] [Codex ▼] [+ Context]

┌─────────────────────────────────────────────────────────────┐
│ Continue TDP. Review the current state and propose what     │
│ should be improved next.                                   │
└─────────────────────────────────────────────────────────────┘

                                         [Send] [Start Run]
```

Preferred keyboard model:

```text
Enter       -> send / continue conversation
Cmd+Enter   -> request Run start or confirmation
```

A Run still requires a valid executable scope.

### 9.4 Project scoping

The Project selector should use the existing Project Registry.

When a Project is selected, Agent Office can resolve:

- repository path
- default branch
- preferred Executor
- Workflow defaults
- project verification commands
- project-specific constraints
- relevant historical Runs

If a user names a Project ambiguously in free text, Agent Office may suggest a Project but must request confirmation before repository-changing execution.

### 9.5 Context attachments

The composer may attach first-class Agent Office context:

- file or directory
- previous Run
- Task
- Finding
- Evidence
- BrainstormSession
- RequirementCandidate
- Project documentation
- PR / issue integration when available

The context rail should remain compact.

---

## 10. Dynamic Team Formation

### 10.1 Principle

Agent Office should not activate every role for every request.

It should form the smallest team that materially contributes to the current phase.

Team formation is based on:

- intent
- Project
- repository state
- approved requirements
- change surface
- risk
- required independent review
- documentation impact

The user should be able to understand why a role is included or excluded.

### 10.2 Role catalog

#### Product Manager

Owns:

- problem framing
- user/business objective
- scope
- RequirementCandidates
- prioritization proposal
- acceptance outcome
- open product questions

Product Manager does not approve requirements on behalf of the user.

#### System Analyst

Owns:

- repository discovery
- current implementation truth
- dependency identification
- existing tests/docs/configuration
- historical context
- impact mapping

System Analyst answers:

> What actually exists now?

#### Principal Engineer

Owns:

- architecture impact
- technical design
- cross-cutting constraints
- implementation strategy
- engineering standards
- technical risk
- high-level technical review

Principal Engineer answers:

> How should we build or change this safely?

#### Product Designer

Activated when work affects:

- user flow
- information architecture
- interaction
- visual hierarchy
- accessibility
- significant frontend experience

Owns:

- UX proposal
- interaction states
- layout
- design acceptance notes

#### Backend Engineer

Activated when approved scope requires backend implementation.

Owns bounded backend code changes in an isolated Workspace.

#### Frontend Engineer

Activated when approved scope requires frontend implementation.

Owns bounded frontend code changes in an isolated Workspace.

#### QA Engineer

Participates in two possible stages:

1. pre-implementation acceptance/test strategy
2. post-implementation independent verification

Owns:

- acceptance scenarios
- regression strategy
- test execution
- Findings

#### Security Reviewer

Conditional role.

Activated for security-relevant scope such as:

- authorization
- authentication
- credentials / secrets
- filesystem safety
- networking
- dependency risk
- destructive operations
- permission boundaries

Security Reviewer remains review-oriented and should not silently implement fixes.

#### Technical Writer

Owns:

- requirement traceability
- user-facing documentation
- API documentation
- operational documentation
- release notes where applicable
- final documentation consistency

Technical Writer should normally join after scope stabilizes, though it may join planning when documentation itself is the product scope.

### 10.3 User role

The human user remains the ultimate Product Owner / Approver.

AI roles may recommend, challenge, summarize, and propose.

They must not silently approve:

- requirements
- major scope changes
- merge
- production deployment
- destructive repository action

### 10.4 Advisory business role

A future optional role may be called:

```text
Product Strategist
```

or

```text
Business Reviewer
```

This role may challenge value, prioritization, or business assumptions.

It must remain advisory.

Do not model a fictional CEO / VP persona with implied authority over the user.

### 10.5 System components are not personas

The following should not be presented as office employees:

- Orchestrator
- Verification Gate
- Workspace Manager
- Event Store / Event System
- scheduler / runtime infrastructure

These are system capabilities.

The Phase 8 `Verifier` persona should evolve toward a non-persona `Verification Gate` concept.

### 10.6 Example — Project re-entry

User:

```text
Project: Technical Documentation Platform
Mode: AUTO

"Continue TDP. We have not worked on it for a while.
Review the current state and decide what should be worked on next."
```

Expected classification:

```text
AUTO -> PLAN
```

Initial Planning Cell:

```text
Product Manager
Principal Engineer
System Analyst

+ Product Designer only if current gaps involve UX
+ QA Engineer when acceptance/test implications need early input
+ Security Reviewer only if the discovered scope is security relevant
```

Backend Engineer and Frontend Engineer are not automatically activated.

Initial output:

```text
PROJECT RE-ENTRY BRIEF

Current state
Observed gaps
Requirement candidates
Technical constraints
Open questions
Risks
Proposed implementation scope
Expected implementation roles
Expected review roles
Documentation impact
```

The user then approves, rejects, edits, or defers RequirementCandidates.

Only after approval does Agent Office form the implementation team.

### 10.7 Example — approved implementation

Approved scope:

```text
REQ-021
REQ-024
```

Agent Office may propose:

```text
Implementation team
- Backend Engineer
- Frontend Engineer

Independent review
- QA Engineer
- Security Reviewer

Knowledge
- Technical Writer
```

Roles that have no material contribution remain inactive.

---

## 11. Planning Before Implementation

For ambiguous, broad, stale, or high-impact requests, Agent Office should favor:

```text
DISCOVER
   ↓
PLAN
   ↓
USER APPROVAL
   ↓
IMPLEMENT
   ↓
REVIEW
   ↓
REMEDIATE if needed
   ↓
VERIFY
   ↓
DOCUMENT
```

This is not a requirement that every small task uses a heavyweight process.

Examples:

Typo in documentation:

```text
Technical Writer
→ Verification Gate
```

Small isolated bug:

```text
System Analyst
→ relevant Engineer
→ QA Engineer
→ Verification Gate
```

Security-sensitive feature:

```text
Product Manager
+ System Analyst
+ Principal Engineer
+ Security Reviewer
→ user scope approval
→ relevant Engineers
→ QA Engineer
+ Security Reviewer
→ Verification Gate
→ Technical Writer
```

---

## 12. Date, Time, and Temporal Context

### 9.1 Global command rail

The shell should display compact current temporal context:

- date
- local time
- timezone
- optional active session duration

This should be quiet UI, not a decorative clock widget.

### 9.2 Brainstorm timestamps

Every persistent planning artifact must retain:

- `created_at`
- author role
- session identity

Approvals should retain:

- `approved_at`
- user action attribution where supported

### 9.3 Historical clarity

Brainstorm notes should not silently change timestamps when edited.

If edits become important, use:

- updated timestamp
- revision history

---

## 13. Top Command Rail

Replace oversized page chrome with a compact command rail.

Potential contents:

Left:

- current area / Project
- Run or Brainstorm Session identity

Center:

- mode indicator
- active runs
- queued / blocked indicator

Right:

- current date/time
- Live / Replay / Ambient / Brainstorm badge
- maximize
- command palette
- notifications
- refresh where applicable

The command rail should remain compact enough that the 3D scene retains vertical space.

---

## 14. Power UX

### 11.1 Camera presets

Provide named views:

- Overview
- Workspace
- Meeting Room
- Pantry
- Recreation
- Lounge
- Review Area

Camera presets are presentation helpers only.

### 11.2 Minimap

Optional compact minimap showing:

- office zones
- factual active agents
- selected agent
- current camera region

Ambient personas should use a visually distinct marker.

### 11.3 Layer toggles

Allow users to toggle:

- labels
- zones
- factual paths
- ambient personas
- event highlights
- minimap
- compact log

### 11.4 Command palette

Keyboard shortcut:

```text
Cmd/Ctrl + K
```

Potential commands:

- Open Project
- Open Run
- Open Office
- Maximize Office
- Start Brainstorm
- Focus selected agent
- Toggle labels
- Toggle minimap
- Show Findings
- Show Evidence
- Historical replay

### 11.5 Keyboard-first navigation

Core Office controls should have keyboard equivalents where practical.

Examples:

- Esc = close drawer / exit maximize
- 1–7 = camera presets when Office View focused
- L = toggle labels
- M = minimap
- E = event log
- F = focus selected agent

Shortcuts must not conflict with text input.

---

## 15. Notification Philosophy

Notifications should be meaningful and quiet.

Three levels are sufficient:

### Informational

Examples:

- agent started
- stage changed
- brainstorm note created

### Attention

Examples:

- agent waiting
- open question blocking brainstorm completion
- finding created

### Critical

Examples:

- AgentRun failed
- blocker finding
- executor unavailable
- workspace safety failure

Avoid persistent toast spam for every event.

The compact log should absorb routine activity.

---

## 16. Futuristic Visual Details

Allowed:

- subtle state glow
- animated live dot
- low-opacity technical grid
- restrained background noise texture
- short camera easing
- spatial focus ring
- subtle screen emissive materials
- zone lighting
- soft ambient movement

Avoid:

- cyberpunk neon everywhere
- hologram overload
- fake terminal rain
- random particle effects
- animated gradients behind every panel
- excessive glassmorphism

The target is **future professional**, not sci-fi decoration.

---

## 17. Truth Model

The product must make data class differences explicit.

### Canonical Operational State

Backed by existing domain truth:

- Project
- Task
- Run
- Stage
- AgentRun
- Event
- Finding
- Evidence
- Workspace

May be shown as factual.

### Ambient State

Ephemeral presentation state.

Examples:

- persona position
- selected ambient pose
- next ambient destination
- illustrative pairing

Must not enter canonical execution Event history.

### Brainstorm State

Persistent planning state, but not execution state.

Examples:

- BrainstormSession
- BrainstormNote
- RequirementCandidate
- DecisionProposal
- OpenQuestion
- Risk
- ActionItem

These records are factual evidence that a planning session generated a proposal.

Their **content**, however, remains proposed until explicitly approved where approval is relevant.

---

## 18. Mode Visual Language

The user should never need to guess which truth model is active.

### Operational

Accent:
cyan / green / amber / red based on factual state

Visible label:

```text
LIVE
```

or

```text
HISTORICAL REPLAY
```

### Ambient

Accent:
muted blue-gray

Visible label:

```text
AMBIENT OFFICE
No active Run
```

Operational status pills are hidden.

### Brainstorm

Accent:
restrained violet

Visible label:

```text
BRAINSTORM
Draft planning session
```

Generated requirements are visibly marked `PROPOSED` until approved.

---

## 19. Anti-AI-Slop Design Rules

All vNext UI should follow these rules:

1. No generic white admin-dashboard shell.
2. No giant cards when a thin structural region is enough.
3. No card-inside-card-inside-card layouts.
4. No oversized headings that reduce information density.
5. No repeated placeholder copy.
6. No arbitrary gradients used only to look modern.
7. No excessive 16–24 px rounded rectangles.
8. No table dumps when a timeline / inspector is more appropriate.
9. No decorative fake metrics.
10. No fake AI activity.
11. Technical identifiers remain compact and available.
12. Dense screens must still have clear visual hierarchy.
13. Empty states should state what is missing and what the user can do next.
14. Spatial UI must not become the only accessible interface.

---

## 20. Performance Requirements

The visual system must degrade gracefully.

Priorities:

1. operational correctness
2. UI responsiveness
3. readable state
4. 3D ambience

Recommended strategies:

- pause or reduce ambient updates in background tabs
- reduce shadow quality on constrained hardware
- cap simultaneous ambient transitions
- reuse geometry/materials where possible
- avoid per-frame React state updates
- keep Brainstorm board HTML where text readability matters
- preserve a non-3D operational path if WebGL fails

Ambient Mode must never consume enough resources to interfere with an active executor workflow.

---

## 21. Accessibility

Requirements:

- dark theme must meet readable contrast targets
- all factual AgentRun information remains available as HTML
- Office View remains optional
- event log is keyboard accessible
- selected-agent inspector is keyboard accessible
- Brainstorm requirements and notes are available outside the 3D board
- color is never the only status signal
- motion reduction setting disables nonessential ambient motion and camera easing

---

## 22. Suggested Information Architecture

Primary shell:

```text
Work
  Overview
  Projects
  Runs
  Tasks

Planning
  Brainstorms
  Requirements

Engineering
  Team / Roles
  Workflows
  Executors

Observability
  Activity
  Evidence

Control
  Audit
  Settings
```

The primary day-to-day entry point is the Universal Composer, not a requirement that users navigate these sections before every request.

The Planning section should only be added once Brainstorm Mode has real persistent records.

---

## 23. Conceptual Screen — Office

```text
┌──────────────────────────────────────────────────────────────────────┐
│ TDP · LIVE · 2 active · 1 waiting                    27 Sep · 10:53  │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│                                                                      │
│                         FULL OFFICE VIEW                             │
│                                                                      │
│                                                                      │
│                                                                      │
├──────────────────────────────────────────────────────────────────────┤
│ [TDP ▼] [AUTO ▼] [Codex ▼] [+ Context]                              │
│ [ Continue the project and review what should be done next... ] [→] │
├──────────────────────────────────────────┬───────────────────────────┤
│ ACTIVITY                                 │ TEAM                      │
│ 10:52 Planning session started           │ ● Product Manager        │
│ 10:53 Repository analysis ready          │ ● Principal Engineer     │
│ 10:53 Requirements proposed              │ ● System Analyst         │
└──────────────────────────────────────────┴───────────────────────────┘
```

The bottom dock is collapsible. Clicking a factual AgentRun opens the inspector instead of permanently reserving 25–28% of the scene.

---

## 24. Conceptual Screen — Brainstorm

```text
┌────────────────────────────────────────────────────────────────────┐
│ Hiring Automation Workshop · BRAINSTORM · 27 Sep 2026 · 10:00 WIB │
├───────────────────────────────────────────────┬────────────────────┤
│                                               │ REQUIREMENTS       │
│          MEETING ROOM / WHITEBOARD            │                    │
│                                               │ REQ-01 Proposed    │
│ PM  Principal  Analyst  QA  Security           │ REQ-02 Approved    │
│                                               │ REQ-03 Deferred    │
│      [notes projected on board]               │                    │
│                                               │ Open questions  2  │
│                                               │ Risks           1  │
├───────────────────────────────────────────────┴────────────────────┤
│ Latest contribution / Ask another round / Approve selected         │
└────────────────────────────────────────────────────────────────────┘
```

---

## 25. Success Criteria

The concept is successful when implementation can satisfy all of the following:

### Visual system

- primary application shell is dark and no longer dominated by white surfaces
- UI remains professional rather than game-like
- state hierarchy remains immediately readable
- Office View feels integrated with the application shell

### Office experience

- scene occupies materially more space than the Phase 8 persistent-sidebar layout
- Office View supports maximize mode
- compact log does not dominate the viewport
- selected detail is available on demand
- camera presets and labels remain usable

### Ambient experience

- office feels inhabited when no active Run exists
- ambient motion is visibly non-operational
- no ambient action enters canonical Event history
- factual Run start immediately takes precedence

### Universal Composer

- user can Ask, Plan, Brainstorm, or Run from one project-aware composer
- AUTO may classify intent but cannot silently execute repository-changing work
- Project Registry provides repository scope and defaults
- previous Run / Finding / Evidence / Requirement context can be attached
- ambiguous repository scope requires confirmation before execution

### Dynamic team formation

- Agent Office proposes the smallest useful team for the current phase
- planning does not automatically activate implementation roles
- role inclusion/exclusion is explainable
- Backend / Frontend roles activate only when approved scope requires them
- QA may contribute before and after implementation
- Security is conditional on relevant risk
- Technical Writer joins based on documentation impact
- user remains final Product Owner / Approver

### Brainstorm experience

- user can explicitly start a Brainstorm Session
- session has date, time, timezone, title, participants, and status
- selected planning roles produce concise visible proposals rather than hidden reasoning
- system creates structured notes and candidate requirements
- requirements remain PROPOSED until user approval
- user can approve, reject, defer, and edit requirement candidates
- approved requirements can become Task / PRD input
- session output remains reviewable after completion

### Truthfulness

- Operational, Ambient, and Brainstorm semantics are visually distinguishable
- generated planning content is not represented as completed engineering work
- existing Run / AgentRun / Event truth remains authoritative for execution

---

## 26. Non-Goals

This concept does not authorize:

- autonomous employee simulation
- fabricated personal conversations between agents
- autonomous HR-like management of agents
- fake productivity scoring
- fake emotional state
- fake work hours
- automatic requirement approval
- automatic merge
- automatic production deployment
- replacement of the operational UI with a 3D-only interface
- exposure of hidden model chain-of-thought

---

## 27. Recommended Product Decisions

The following defaults are recommended for implementation:

1. **Dark theme becomes the default visual direction.**
2. **Operational Mode remains the highest-trust mode.**
3. **Ambient Idle Mode is enabled by default but can be disabled.**
4. **Ambient movement never writes canonical Events.**
5. **Textual inter-agent discussion exists only inside explicit Brainstorm Sessions.**
6. **Brainstorm output is structured into notes / requirements / decisions / risks instead of being primarily a chat transcript.**
7. **Requirement approval is always explicit user action.**
8. **Office View gets a real maximize mode.**
9. **The persistent Phase 8 right sidebar evolves into a collapsible Bottom Operations Dock + on-demand inspector.**
10. **Universal Composer becomes the primary interaction surface for ASK / PLAN / BRAINSTORM / RUN.**
11. **AUTO may infer intent but never silently starts repository-changing execution.**
12. **Agent Office dynamically forms the smallest useful team instead of activating every role.**
13. **The human user remains the final Product Owner / Approver.**
14. **Principal Engineer replaces the generic Architect persona for vNext technical leadership.**
15. **System Analyst replaces Explorer for repository/current-state discovery.**
16. **Verification Gate is a system capability, not an office persona.**
17. **The same role appearance can be reused across modes, but mode badges and status language must clearly distinguish persona from AgentRun.**
18. **Dark UI redesign should cover the application shell, not just the Office View.**
19. **Mission-control polish should remain restrained and professional.**

---

## 28. Future Extensions

After the core vNext concept proves useful, possible extensions include:

- reusable Brainstorm templates
- requirement-to-workflow generation
- decision log
- architecture workshop mode
- incident response room
- release readiness room
- project-specific office customization
- multi-project mission-control overview
- optional ambient soundscape
- second-monitor kiosk mode
- session export to Markdown / project documentation
- integration with external issue trackers
- reusable requirement approval workflows

These are not required for the first implementation slice.

---

## 29. Product Principle

Agent Office vNext should feel more alive without becoming less trustworthy.

The governing rule is:

> **Operational facts are facts. Ambient life is visibly illustrative. Brainstorm content is visibly proposed until approved. The office forms the smallest useful team for the work, and the human remains the final approver.**

That distinction allows the product to become more immersive, futuristic, and collaborative without sacrificing engineering credibility.
