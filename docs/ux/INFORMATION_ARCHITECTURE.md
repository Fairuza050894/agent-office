# Agent Office — Information Architecture

Status: Draft  
Version: 0.1  
Scope: Product navigation, page hierarchy, operational surfaces, run detail structure, executor visibility, evidence, audit, and Office View relationship

---

## 1. Purpose

This document defines the information architecture and interaction hierarchy for Agent Office.

Agent Office is an engineering operations product first and a virtual office visualization second.

The interface must help the user answer:

1. What projects are registered?
2. What work is currently running?
3. Which agent is responsible for each part?
4. Which executor is actually running the agent?
5. What is blocked?
6. What evidence exists?
7. What still requires review or approval?
8. Are changes merged or still isolated?
9. What happened historically?
10. What is merely visualization versus authoritative execution state?

The UI must remain useful even if Office View is disabled.

---

## 2. Product Navigation Principles

The navigation should prioritize:

- projects
- runs
- current work
- blockers
- agents
- workflows
- executors
- evidence
- audit

The UI should avoid:

- giant decorative dashboards
- fake KPI cards
- fake percentages
- rainbow status colors
- large empty hero sections
- excessive card grids
- AI-themed visual noise
- gamified productivity scoring

The interface should resemble an engineering operations control plane.

---

## 3. Primary Navigation

Recommended global navigation:

```text
AGENT OFFICE

WORK
  Overview
  Projects
  Runs
  Tasks

ENGINEERING
  Agents
  Workflows
  Executors

OBSERVABILITY
  Activity
  Evidence

CONTROL
  Audit
  Settings
```

`Office` should be available contextually from a Run and optionally as a global live view.

---

## 4. Global Overview

Route:

```text
/
```

or:

```text
/overview
```

Purpose:

- surface active work
- surface blocked work
- show executor availability
- provide quick access to recent projects/runs

Recommended hierarchy:

```text
Overview

Needs attention
────────────────────────────────
Blocked runs
Approval required
Executor unavailable
Workspace conflict

Active runs
────────────────────────────────
Project
Task
Stage
Active agents
Executor
State
Started

Recent activity
────────────────────────────────
normalized event feed

Executor status
────────────────────────────────
Codex
Antigravity
OpenClaw
```

Avoid large summary KPI cards.

---

## 5. Needs Attention

The highest-priority area should show only actionable items.

Examples:

```text
Run #142 blocked
Codex weekly quota exhausted
Action: Choose another executor or wait

Run #138 requires approval
Command: npm install
Project: Customer Portal

Run #136 has 1 open security blocker
Action: Open findings
```

No generic alerts without action.

---

## 6. Project Registry

Route:

```text
/projects
```

Use a table-first interface.

Columns:

```text
Project
Repository
Default branch
Preferred executor
Default workflow
Active runs
Status
Action
```

Example:

```text
Technical Documentation Platform
technical-documentation-platform
main
Codex
Enterprise Engineering
1
Active
Open
```

---

## 7. Add Project

Route:

```text
/projects/new
```

Flow:

```text
Repository path
        ↓
Validate Git repository
        ↓
Detect basic metadata
        ↓
User confirms
        ↓
Configure defaults
        ↓
Create Project
```

Fields:

```text
Project name
Repository path
Default branch
Preferred executor
Default workflow
```

Optional detected data:

```text
Git remote
languages
package manager
AGENTS.md detected
test commands detected
```

Detection must be reviewable.

---

## 8. Project Validation State

Possible presentation:

```text
Repository
✓ Valid Git repository

Branch
main

Remote
origin configured

Instructions
AGENTS.md detected

Working tree
Dirty
```

Dirty state is informational, not an automatic error.

---

## 9. Project Detail

Route:

```text
/projects/:projectId
```

Project navigation:

```text
Overview
Tasks
Runs
Repository
Workflows
Agents
Settings
```

---

## 10. Project Overview

Recommended hierarchy:

```text
Project identity
────────────────────────────────
Repository
Default branch
Preferred executor
Default workflow

Needs attention
────────────────────────────────
blocked runs
executor issue
workspace issue

Active work
────────────────────────────────
active Runs

Recent Runs
────────────────────────────────
history

Repository state
────────────────────────────────
working tree status
current revision
```

Do not show fabricated repository health score.

---

## 11. Project Repository Surface

Route:

```text
/projects/:projectId/repository
```

Show:

```text
Repository identity
Registered path (safe display)
Default branch
Current revision
Main working tree state
Git remote
Detected instructions
Active Agent Office worktrees
```

Safe display may abbreviate absolute local path.

---

## 12. Project Worktrees

Table:

```text
Workspace
Run
Agent
Branch
State
Base revision
Changes
Retention
```

Example:

```text
backend
Run #142
Backend Developer
agent-office/run-142/backend
In use
8af52a1
7 files
Manual
```

---

## 13. Project Tasks

Route:

```text
/projects/:projectId/tasks
```

Table:

```text
Task
Created
Latest Run
Latest state
Workflow
Action
```

---

## 14. Task Detail

Route:

```text
/tasks/:taskId
```

Show:

```text
Objective
Constraints
Project
Requested workflow
Requested executor
Run history
```

A Task detail must not merge results from multiple Runs into one ambiguous state.

---

## 15. Create Task

Primary action from Project:

```text
[ Create task ]
```

Form:

```text
Objective
Constraints (optional)
Workflow
Executor
```

Executor options:

```text
Project default
Codex
Antigravity
OpenClaw
Auto (future)
```

---

## 16. Task Creation Preview

Before Run starts:

```text
Workflow: Enterprise Engineering

Discovery
Architect + Explorer

Implementation
Backend / Frontend when applicable

Review
QA + Security + UX if applicable

Verification
Required project checks

Executor
Codex
```

User should understand what will happen.

---

## 17. Run Registry

Route:

```text
/runs
```

This is one of the primary operational pages.

Columns:

```text
Run
Project
Task
Stage
State
Active agents
Primary executor
Started
Action
```

Filters:

```text
Project
State
Executor
Workflow
Date
```

---

## 18. Run Status Presentation

Use restrained labels:

```text
Planning
Running
Reviewing
Remediating
Verifying
Blocked
Completed
Failed
Cancelled
```

Avoid rainbow badges.

Color is supplemental, not sole indicator.

---

## 19. Run Detail

Route:

```text
/runs/:runId
```

Run tabs:

```text
Overview
Workflow
Agents
Activity
Changes
Tests
Findings
Evidence
Office
```

This page is the central operational unit.

---

## 20. Run Header

Compact header:

```text
Run #142
G4C Extraction Accuracy Hardening

Project
Technical Documentation Platform

State
Reviewing

Workflow
Enterprise Engineering v1

Started
12 Sep 2026, 14:04

Primary executor
Codex
```

Primary actions:

```text
Cancel Run
Resume
Retry
Choose Executor
```

Only show actions valid for current state.

---

## 21. Run Overview

Recommended hierarchy:

```text
Needs attention
────────────────────────────────
1 security blocker

Workflow status
────────────────────────────────
Discovery      Complete
Implementation Complete
Review         Running
Verification   Pending

Active agents
────────────────────────────────
QA Reviewer        Running
Security Reviewer  Running

Changes
────────────────────────────────
7 files changed
+121 / -34
Unmerged

Evidence
────────────────────────────────
Tests       Available
Build       Available
Security    Pending
```

---

## 22. Run Completion State

Completed Run must still show integration truth:

```text
Run
Completed

Engineering verification
Passed

Integration
Unmerged

Main branch
Unchanged
```

This prevents "Completed" from being interpreted as "merged/deployed".

---

## 23. Workflow View

Route:

```text
/runs/:runId/workflow
```

Render canonical WorkflowSnapshot + RunStageState.

Example:

```text
Discovery ✓
   ├── Architect ✓
   └── Explorer  ✓
        │
        ▼
Implementation ✓
   ├── Backend  ✓
   └── Frontend Skipped
        │
        ▼
Review ●
   ├── QA       Running
   ├── Security Running
   └── UX       Skipped
        │
        ▼
Verification ○
```

---

## 24. Workflow View Requirements

Every node must show:

```text
name
state
role
executor when AgentRun exists
duration when available
blocking reason when blocked
skip reason when skipped
```

Do not show fake completion percentage.

---

## 25. Workflow Dependency Explanation

Clicking a waiting node should explain why.

Example:

```text
QA Reviewer
Waiting

Blocked by:
Backend Developer must complete first.
```

or:

```text
Verification
Waiting

Blocked by:
1 open security blocker.
```

---

## 26. Fan-Out Visualization

Parallel execution should be visible but not over-stylized.

Example:

```text
          Architect ✓
Discovery ┤
          Explorer  ✓
```

---

## 27. Fan-In Visualization

Show that downstream stage waits for multiple nodes.

Example:

```text
Backend ✓ ──┐
            ├── QA ●
Frontend ✓ ─┘
```

---

## 28. Remediation Loop Visualization

Represent:

```text
Review
  ↓ blocker
Remediation
  ↓
Re-review
```

Do not create visually confusing infinite cycles.

Show cycle count:

```text
Remediation cycle 2 of 3
```

This is factual policy state.

---

## 29. Agents Page

Global route:

```text
/agents
```

Shows reusable AgentProfiles, not active AgentRuns.

Columns:

```text
Role
Access mode
Version
Required capabilities
Status
```

---

## 30. Agent Profile Detail

Route:

```text
/agents/:agentProfileId
```

Show:

```text
Name
Role key
Description
Default access
Instructions
Required capabilities
Version
Used by workflows
```

Do not expose secrets.

---

## 31. Run Agents

Route:

```text
/runs/:runId/agents
```

Shows concrete AgentRuns.

Columns:

```text
Agent role
Stage
Executor
Workspace
State
Attempt
Started
Duration
Result
```

---

## 32. AgentRun Detail

Route:

```text
/runs/:runId/agents/:agentRunId
```

Recommended:

```text
Role
Executor
State
Stage
Attempt
Workspace
Started
Completed

Assignment
────────────────────────
objective / responsibility

Activity
────────────────────────
normalized events

Changes
────────────────────────
workspace change summary

Evidence
────────────────────────
tests / result / review

Executor
────────────────────────
session ref safe display
capabilities
runtime version
```

---

## 33. Agent Result

Show clear distinction:

```text
Agent result
Success

Run status
Reviewing
```

So user understands successful AgentRun does not mean successful Run.

---

## 34. Executor Registry

Route:

```text
/executors
```

Table:

```text
Executor
Kind
Status
Runtime
Capabilities
Last checked
Action
```

Example:

```text
Codex
CODEX
Unavailable
Codex CLI
8 supported
09:42
Open
```

---

## 35. Executor Detail

Route:

```text
/executors/:executorId
```

Sections:

```text
Status
Configuration
Capabilities
Security posture
Runtime details
Known limitations
Recent Runs
```

---

## 36. Executor Capability View

Prefer factual table:

```text
Capability          Support
────────────────────────────
Start execution     Supported
Status query        Supported
Cancellation        Supported
Event stream        Unknown
Token usage         Unsupported
Subagents           Supported
```

No generic intelligence score.

---

## 37. Executor Security Posture

Show facts:

```text
Execution
Local

Filesystem isolation
Worktree only

Command interception
Unavailable

Network restriction
Unavailable

Credential mode
Provider-native authentication
```

Avoid badge:

```text
Secure
```

---

## 38. Executor Unavailable State

Example:

```text
Codex unavailable

Reason
Weekly quota exhausted

New AgentRuns cannot start.

Existing running sessions
None

[ Recheck ]
```

Only show reset time if factual source exists.

---

## 39. Workflow Registry

Route:

```text
/workflows
```

Table:

```text
Workflow
Version
Stages
Required roles
Status
Used by projects
```

---

## 40. Workflow Detail

Route:

```text
/workflows/:workflowId
```

Show:

```text
Description
Version
Graph
Conditions
Gates
Agent roles
Executor requirements
Remediation policy
```

---

## 41. Workflow Version History

Example:

```text
Enterprise Engineering
v1 Active
v2 Draft
```

Old Run links always show their snapshot version.

---

## 42. Workflow Validation

Draft workflow view should show:

```text
Validation

✓ dependency graph valid
✓ all roles exist
✓ completion path exists
✕ unknown capability requirement
```

No activation while invalid.

---

## 43. Activity

Global route:

```text
/activity
```

Filters:

```text
Project
Run
Agent
Event type
Time
```

Use chronological table/timeline.

---

## 44. Activity Item

Example:

```text
14:32:11
Security Reviewer
Created blocker
Authorization check missing
Run #142
```

Activity text should be deterministic from normalized events.

---

## 45. Activity Detail

Expandable details:

```text
Event type
Source
Occurred at
Recorded at
Correlation ID
Safe payload
```

Raw provider payload is not shown.

---

## 46. Evidence Registry

Route:

```text
/evidence
```

Filters:

```text
Project
Run
Kind
Status
Agent
```

Table:

```text
Evidence
Kind
Project
Run
Status
Source
Created
```

---

## 47. Evidence Detail

Show:

```text
Kind
Status
Summary
Run
Agent
Timestamp
Artifact
Safe metadata
```

Examples:

```text
TEST_RESULT
DIFF_SUMMARY
SECURITY_REVIEW
BUILD_RESULT
```

---

## 48. Test View

Route:

```text
/runs/:runId/tests
```

Table:

```text
Check
Status
Passed
Failed
Skipped
Duration
Evidence
```

Unknown values should render:

```text
Unavailable
```

not zero.

---

## 49. Test Failure

Example:

```text
Backend tests
Failed

140 passed
2 failed
3 skipped

[ View evidence ]
```

No fake "quality score".

---

## 50. Findings View

Route:

```text
/runs/:runId/findings
```

Table:

```text
Severity
Category
Finding
Reviewer
Status
Location
Remediation owner
```

---

## 51. Finding Detail

Show:

```text
Severity
Status
Title
Description
Reviewer
Created
Location
Evidence
Remediation
Resolution
```

Original finding text remains visible after resolution.

---

## 52. Blocker Presentation

Blocker should be operationally prominent:

```text
BLOCKER

Authorization check missing

Reviewer
Security Reviewer

Status
Remediating

Owner
Backend Developer
```

Avoid giant red cards.

---

## 53. Accepted Risk

If user accepts risk:

```text
Status
Accepted risk

Accepted by
Local user

Reason
...

Timestamp
...
```

Never hide original blocker.

---

## 54. Changes View

Route:

```text
/runs/:runId/changes
```

Show by Workspace:

```text
Backend
7 files changed
+121 / -34
Unmerged

Frontend
3 files changed
+88 / -10
Unmerged
```

---

## 55. Change File Table

Columns:

```text
Path
Change type
Workspace
Agent
```

Paths repository-relative.

---

## 56. Diff Detail

Detailed diff viewer is useful but not required for first MVP.

If implemented:

- safe syntax highlighting
- no hidden destructive actions
- file navigation
- evidence links

---

## 57. Integration State

Show separately:

```text
Implementation worktrees
Ready

Integration workspace
Not created

Main project branch
Unchanged
```

---

## 58. Evidence and Changes Relationship

Tests should identify which Workspace/revision they apply to.

Example:

```text
Tests passed
Workspace: backend
Revision: 8af52a1 + working diff
```

---

## 59. Approval Surface

Approvals should appear in:

```text
Needs attention
Run Overview
AgentRun detail
Audit
```

Example:

```text
Approval required

Backend Developer requests:
npm install

Workspace:
run-142/backend

Reason:
Install test dependencies.

[ Deny ] [ Approve ]
```

---

## 60. Audit

Route:

```text
/audit
```

Table:

```text
Time
Actor
Action
Target
Project
Run
```

Examples:

```text
Executor changed
Risk accepted
Run cancelled
Workspace released
Restricted command approved
```

---

## 61. Settings

Route:

```text
/settings
```

Initial sections:

```text
General
Storage
Executors
Security
Retention
Developer
```

---

## 62. General Settings

Examples:

```text
Agent Office data root
Backend host
Backend port
Frontend preferences
```

Default host remains:

```text
127.0.0.1
```

---

## 63. Storage Settings

Show:

```text
Database
Artifacts
Workspaces
Logs
Disk usage
```

No automatic aggressive cleanup.

---

## 64. Security Settings

Show factual controls:

```text
Local-only mode
Restricted command approval
Raw provider payload retention
Auto commit
Auto merge
```

Defaults should be conservative.

---

## 65. Office View

Contextual route:

```text
/runs/:runId/office
```

Optional global live office:

```text
/office
```

The Run-level Office should be built first.

---

## 66. Office View Purpose

Office View provides an intuitive visualization of actual agent lifecycle.

It is not:

- workflow source of truth
- status authority
- task planner
- fake simulation

It is a projection.

---

## 67. Office View Layout

Potential zones:

```text
Planning Area
Architecture Desk
Backend Desk
Frontend Desk
QA Desk
Security Desk
UX Desk
Documentation Desk
Waiting Area
Review Area
```

Stations appear only for relevant roles where practical.

---

## 68. Office View Agent Mapping

Examples:

```text
Architect
→ Architecture Desk

Backend Developer
→ Backend Desk

QA Reviewer
→ QA Desk

Security Reviewer
→ Security Desk
```

---

## 69. Office State Mapping

```text
PENDING
→ waiting area / inactive

STARTING
→ moving to station

RUNNING
→ working at station

WAITING
→ waiting indicator

BLOCKED
→ blocked indicator

FAILED
→ failure state

COMPLETED
→ finished / inactive
```

---

## 70. Office View Truthfulness

Do not animate:

```text
typing
testing
reviewing
walking to another agent
```

unless corresponding AgentRun/Event state supports it.

---

## 71. Office View Activity Bubble

Allowed:

```text
Running tests
Waiting for QA
Review complete
```

only if normalized events prove it.

Avoid model-generated speculative inner thought.

---

## 72. Office View Agent Detail

Click agent opens a drawer:

```text
Backend Developer

State
Running

Executor
Codex

Stage
Implementation

Workspace
Isolated worktree

Started
14:12

Last activity
Workspace changed: 7 files

[ Open Agent Details ]
```

---

## 73. Office View Project Context

Header:

```text
Technical Documentation Platform
Run #142
G4C Extraction Accuracy Hardening
```

Never display agents from unrelated Projects in a Run-specific Office.

---

## 74. Global Office View

Future global view may show multiple Project rooms/floors.

Example:

```text
TDP
3 agents active

Hermes QA
2 agents active
```

But this is not required for MVP.

---

## 75. Office View Visual Style

Office View may use pixel-art / Gather-inspired composition, but:

- assets must be original or properly licensed
- labels remain readable
- status remains accessible
- keyboard navigation remains possible
- operational alternative always exists
- visual fun must not obscure facts

---

## 76. Office View Accessibility

Provide non-visual equivalent.

Every office state is also available through:

```text
Workflow
Agents
Activity
```

Office View must not be required to operate the system.

---

## 77. Office View Responsive Behavior

Desktop priority:

```text
1280–1600
```

At narrower widths:

- office may become scrollable/zoomable
- operational side panel remains usable
- no loss of status information

Mobile optimization is not MVP priority.

---

## 78. Design System Direction

Visual direction:

```text
enterprise engineering control plane
neutral palette
subtle borders
information-dense tables
restrained status indicators
clear typography hierarchy
```

Avoid:

```text
gradients
glassmorphism
giant hero illustrations
rainbow status colors
card soup
AI sparkle decoration
```

Office tab may be playful while remaining coherent with the rest of product.

---

## 79. Typography

Use a professional system sans-serif or bundled/openly licensed font.

Code/identifiers use monospace.

Do not introduce decorative sci-fi fonts.

---

## 80. Status Language

Use explicit text:

```text
Running
Waiting
Blocked
Completed
Failed
Cancelled
```

Do not rely only on icon/color.

---

## 81. Link Behavior

Agent Office owns link styling.

Avoid browser-default visited purple.

Preserve:

- keyboard focus
- underline/affordance where appropriate
- semantic anchor behavior

---

## 82. Empty States

Empty state must always answer:

```text
What is missing?
Why?
What can I do next?
```

Example:

```text
No projects yet

Register a Git repository to start using Agent Office.

[ Add project ]
```

---

## 83. No Run Empty State

```text
No runs yet

Create a task for this project and start a workflow.

[ Create task ]
```

---

## 84. Executor Empty State

```text
No executor configured

ReferenceExecutor can be used for foundation testing.
Configure a real executor when integration is ready.
```

---

## 85. Loading State

Use restrained skeleton/progress.

Do not fake agent progress while API is loading.

---

## 86. Error State

Error messages should include:

```text
what failed
safe reason
retry action
correlation ID when useful
```

---

## 87. Blocked State

Blocked is distinct from error.

Example:

```text
Run blocked

Codex is unavailable.

No code was started.

[ Recheck ]
[ Choose executor ]
```

---

## 88. Unknown State

Represent explicitly:

```text
Execution status unknown

Agent Office cannot confirm whether the external session is still running.

Workspace has been retained for safety.

[ Reconcile ]
```

---

## 89. Destructive Action Confirmation

Actions like:

```text
Cancel Run
Release Workspace
Delete Artifact
Archive Project
```

need explicit confirmation where impact matters.

---

## 90. No Generic Confirm Spam

Do not confirm harmless actions such as:

```text
Refresh
Open
Filter
Navigate
```

---

## 91. Notification Strategy

Use notifications for:

```text
Run blocked
Approval required
Run completed
Executor unavailable
Cleanup failed
```

Avoid noisy toast for every event.

---

## 92. Event Timeline vs Toast

Frequent lifecycle events belong in Activity.

Only high-value events become notifications.

---

## 93. Search

Global search may later include:

```text
Projects
Tasks
Runs
Findings
Evidence
```

Not required for earliest MVP.

---

## 94. Filters

Tables should support useful filters rather than dashboard proliferation.

---

## 95. Pagination

Hide pagination controls when collection is genuinely empty or single-page with no navigation need.

---

## 96. Date Format

Use consistent human-readable format, for example:

```text
12 Sep 2026, 14:32
```

Exact localization may follow user locale.

---

## 97. Duration

Examples:

```text
4m 12s
1h 08m
```

Do not show excessive millisecond precision in normal UI.

---

## 98. Identifier Display

Prefer:

```text
Run #142
```

while retaining full immutable ID in detail/copy actions.

---

## 99. Project Names

Use user-friendly display names.

Repository technical identity shown secondarily.

---

## 100. Executor Names

Example:

```text
Codex Personal
Antigravity Local
OpenClaw Local
```

Kind displayed secondarily.

---

## 101. Breadcrumbs

Use breadcrumbs for deep pages:

```text
Projects / TDP / Runs / #142
```

Avoid breadcrumbs that consume excessive horizontal space.

---

## 102. Global vs Project Context

Global pages:

```text
Projects
Runs
Agents
Workflows
Executors
Activity
Evidence
Audit
Settings
```

Project pages remain clearly scoped.

---

## 103. Global Run Links

Every global Run row must identify Project.

Never show ambiguous Run #142 without Project context where collisions/confusion may occur.

---

## 104. Context Preservation

When navigating from Project → Run → Finding, preserve easy return path.

---

## 105. Deep Linking

Important resources need stable URLs:

```text
/projects/:id
/tasks/:id
/runs/:id
/runs/:id/agents/:id
/runs/:id/findings/:id
/evidence/:id
/executors/:id
/workflows/:id
```

---

## 106. Back/Forward Navigation

Filters and selected tabs should use URL state where practical.

---

## 107. Table Density

Prefer compact operational rows.

Do not make every table row a large card.

---

## 108. Cards

Use cards only for:

- concise grouped context
- meaningful summary section
- office side panel

Do not build card grids for list data.

---

## 109. Metrics

Allowed metrics:

```text
3 active Runs
1 blocked Run
7 active AgentRuns
2 open blockers
```

Avoid opaque scores.

---

## 110. Workflow Metrics

Allowed:

```text
4 of 7 required nodes complete
```

Not:

```text
57% engineering health
```

---

## 111. Executor Metrics

Allowed if factual:

```text
3 active sessions
last check 2m ago
```

Avoid "AI quality score".

---

## 112. Evidence Readiness

Only show readiness labels if backend has explicit state.

Do not infer:

```text
Ready
```

from presence of a file alone unless contract defines it.

---

## 113. Accessibility

Minimum expectations:

- semantic tables
- labels for controls
- keyboard navigation
- visible focus
- text status in addition to color
- sufficient contrast
- accessible dialogs
- accessible Office alternative

---

## 114. Keyboard Operation

User should be able to:

- navigate lists
- open Run
- switch tabs
- review finding
- approve/deny
- operate dialogs

without mouse.

---

## 115. Focus Management

Dialogs and drawers:

- focus trapped appropriately
- focus returned on close
- escape behavior predictable

---

## 116. Iconography

Use icons sparingly.

Icons supplement text.

Do not use emojis as primary enterprise navigation icons.

Office View characters may be playful, but operational navigation remains professional.

---

## 117. Global Dashboard Anti-Pattern

Avoid:

```text
85%
AI PRODUCTIVITY SCORE

94
TEAM HEALTH

2.3x
VELOCITY
```

No factual basis.

---

## 118. Office Anti-Pattern

Avoid showing 8 agents sitting in office when only 2 AgentRuns exist.

Only instantiate visible active/relevant agents.

---

## 119. Office Idle Roles

If role is part of workflow but not yet instantiated:

may show a subdued station label, but not a fake working agent.

---

## 120. Office Completed Agent

Completed agent may:

- become inactive at desk
- move to completed area
- disappear with history available

Choice is visual, not domain behavior.

---

## 121. Office Failure

Failure should be clear without alarmist animation.

Example:

```text
Backend
Failed

Executor start failed
```

---

## 122. Office Blocker

Security blocker may produce visible review marker linked to Finding.

---

## 123. Office Collaboration Animation

Do not simulate one agent "talking" to another unless real dependency/handoff event occurred.

---

## 124. Office Historical Playback

Future feature:

```text
Replay Run
```

using persisted events.

Must display:

```text
Historical replay
```

not Live.

---

## 125. Global Live Status

Top bar may show:

```text
3 active Runs
1 blocked
```

No continuously animated AI status indicator required.

---

## 126. Executor Quick Switch

Run blocked due executor may offer:

```text
Choose executor
```

Only list compatible executor configurations.

---

## 127. Compatibility Warning

Example:

```text
Antigravity cannot satisfy required cancellation capability for this workflow.
```

Do not allow selection silently.

---

## 128. Workflow Preview Before Start

Show:

```text
7 planned agent assignments
2 may run in parallel
3 review roles
1 verification stage
```

Only after actual plan is known.

---

## 129. Planned vs Instantiated Agents

Distinguish:

```text
Planned role
```

from:

```text
AgentRun created
```

No fake AgentRun row before instantiation unless marked Planned.

---

## 130. Project-Specific Workflow Defaults

Project settings:

```text
Preferred workflow
Preferred executor
Verification commands
Write policy
```

---

## 131. Project Settings Safety

Changing defaults affects future Runs only.

Historical Runs remain unchanged.

---

## 132. Settings Change Feedback

Show:

```text
Applies to new Runs only.
```

where relevant.

---

## 133. Run Snapshot Visibility

Run Overview may show:

```text
Workflow snapshot
Enterprise Engineering v1

Project policy snapshot
Captured at Run start
```

Useful for historical truth.

---

## 134. Searchable Findings

Future global Findings page may be added if real usage proves need.

MVP can keep Findings Run-scoped.

---

## 135. Evidence Navigation

Evidence links should allow:

```text
Evidence → AgentRun
Evidence → Run
Evidence → Artifact
```

---

## 136. Audit Navigation

Audit row may link to relevant:

```text
Run
Finding
Workspace
Executor
```

---

## 137. Settings vs Project Policy

Global Settings control Agent Office defaults.

Project Settings control project-specific policy.

Workflow controls execution sequence.

Keep these conceptually separate.

---

## 138. Information Hierarchy Priority

At any Run page, priority is:

```text
1. blocker/action required
2. current stage/state
3. active agents
4. evidence/results
5. history/details
6. decoration
```

---

## 139. Operations vs Office

Operations View answers:

```text
What is true?
What is blocked?
What changed?
What evidence exists?
```

Office View answers:

```text
What is happening visually right now?
```

Operations View remains primary.

---

## 140. Office View Failure Independence

If Office renderer crashes:

- Run continues
- workflow unaffected
- Operations UI remains available

Office View is presentation-only.

---

## 141. Office Assets Failure

Missing sprite/image must not block Run Detail.

Show operational fallback.

---

## 142. Office Rendering Technology

Implementation may use:

```text
DOM/CSS
Canvas
PixiJS
other lightweight renderer
```

Technology should be chosen after MVP operations UI exists.

Do not select game engine before actual need.

---

## 143. Office Asset Licensing

Every third-party asset must have documented license/provenance.

Prefer original assets.

---

## 144. Responsive Scope

MVP priority:

```text
1600
1280
1024
```

Narrower viewport should remain usable but full mobile optimization is not required.

---

## 145. Desktop Layout

Recommended:

```text
left navigation
top context bar
main content
optional right detail drawer
```

Avoid excessive nested sidebars.

---

## 146. Run Workflow Full-Width

Workflow graph may use wide canvas but page-level horizontal overflow should be avoided.

Use contained pan/zoom if needed.

---

## 147. Office Full-Width

Office may use dedicated wide viewport with controls:

```text
Fit
Zoom
Center
```

---

## 148. State Refresh

REST fetch provides canonical current state.

SSE provides realtime updates.

On reconnect:

```text
fetch current state
+
resume event stream
```

---

## 149. Stale UI

If realtime disconnected:

```text
Live updates disconnected
Last update: 14:32

[ Reconnect ]
```

Do not continue pretending live.

---

## 150. Event Replay on Reconnect

Activity feed may replay missed events from last Event ID.

---

## 151. Run Action Availability

Examples:

```text
CREATED
→ Start / Cancel

BLOCKED
→ Resume / Choose executor / Cancel

RUNNING
→ Cancel

COMPLETED
→ Inspect / Export

FAILED
→ Retry / Inspect
```

Backend remains authoritative; frontend action visibility is convenience only.

---

## 152. Cancellation UI

Cancellation dialog:

```text
Cancel Run #142?

Active AgentRuns:
Backend Developer

Workspace changes will be preserved until execution termination is confirmed.

[ Keep running ]
[ Request cancellation ]
```

Truthful about async cancellation.

---

## 153. Workspace Release UI

Example:

```text
Release workspace?

Run is complete.
Changes are unmerged.
The generated branch will be retained.

[ Cancel ]
[ Release workspace ]
```

---

## 154. Cleanup Failure UI

```text
Workspace cleanup failed

The implementation result remains completed.
The workspace has been marked orphaned.

[ Inspect workspace ]
[ Retry cleanup ]
```

Do not convert Run to failed automatically if not required.

---

## 155. Audit Clarity

Control-plane changes should be traceable from relevant UI.

Example:

```text
Executor changed from Codex to Antigravity
12 Sep 2026, 15:14
```

---

## 156. Product Terminology

Use consistently:

```text
Project
Task
Run
Workflow
Stage
Agent
AgentRun
Executor
Workspace
Finding
Evidence
Artifact
Approval
Audit
```

Avoid casually mixing:

```text
job
thread
bot
worker
agent
task
```

unless provider-specific detail is clearly labeled.

---

## 157. Provider Terminology

Provider concepts may appear in Executor detail only.

Example:

```text
Codex session
```

but primary object remains:

```text
AgentRun
```

---

## 158. Error Terminology

Use:

```text
Failed
Blocked
Unavailable
Unknown
```

carefully.

They are not interchangeable.

---

## 159. Unknown vs Unavailable

```text
Unavailable
```

means known not available.

```text
Unknown
```

means cannot determine.

UI must preserve distinction.

---

## 160. Partial Evidence

Evidence may be:

```text
Partial
```

without failing the Run if not required by workflow.

---

## 161. Unavailable Evidence

Do not show:

```text
0 vulnerabilities
```

when security review did not run.

Show:

```text
Security evidence unavailable
```

---

## 162. Office View and Evidence

Office View may indicate:

```text
QA finished
```

but detailed result remains in Tests/Evidence.

Avoid showing dense test report inside pixel office.

---

## 163. Office View and Findings

A small blocker marker may link to Findings.

Do not display full security details in tiny speech bubble.

---

## 164. Run Final Report

Run completion page should summarize:

```text
Outcome
Workflow
Agents
Executors
Changes
Tests
Findings
Evidence
Integration state
Remaining warnings
```

This is generated from durable data.

---

## 165. Export

Future export:

```text
Run report
JSON
Markdown
PDF
```

Not MVP requirement.

---

## 166. Project Onboarding UX Acceptance

User can:

1. select repository
2. see validation
3. see branch
4. see dirty state
5. choose defaults
6. register without modifying repository

---

## 167. Run UX Acceptance

User can:

1. identify current state
2. identify blocker
3. identify active AgentRuns
4. identify executors
5. identify changes
6. identify tests
7. identify Findings
8. understand merge state
9. cancel safely
10. inspect evidence

---

## 168. Office UX Acceptance

User can:

1. identify which AgentRuns actually exist
2. identify which are active
3. identify waiting/blocked/failed states
4. click agent for real details
5. distinguish live from historical
6. operate product without Office View

---

## 169. MVP Navigation Acceptance

MVP must include:

```text
Overview
Projects
Runs
Agents
Workflows
Executors
Activity
Evidence
Audit
Settings
```

Project detail and Run detail are contextual.

---

## 170. MVP Run Tabs

MVP target:

```text
Overview
Workflow
Agents
Activity
Changes
Tests
Findings
Evidence
```

Office may arrive after operational MVP but route contract should anticipate it.

---

## 171. Phase Ordering

Recommended frontend implementation:

```text
1. App shell
2. Projects
3. Project detail
4. Tasks / create Task
5. Runs registry
6. Run Overview
7. Workflow view
8. AgentRuns
9. Activity
10. Changes
11. Tests
12. Findings
13. Evidence
14. Executors
15. Audit / Settings
16. Office View
```

---

## 172. No Office-First Implementation

Do not begin frontend implementation with animated office.

Operations UI must establish canonical information architecture first.

---

## 173. Visual Review Gate

Before Office View:

- 1600 render
- 1280 render
- 1024 render
- no page overflow
- tables readable
- focus visible
- empty/loading/error states
- blockers obvious
- no browser-default unstyled controls
- no fake metrics

---

## 174. Office Visual Review Gate

When Office View arrives:

- agents correspond to real AgentRuns
- state transitions match events
- no fake workers
- labels readable
- keyboard accessible fallback
- no misleading animation
- performance acceptable
- asset license documented

---

## 175. Primary Information Architecture Invariants

1. Operations UI is primary.
2. Office View is optional projection.
3. Run is the main unit of execution inspection.
4. Project context is always visible for Run.
5. AgentProfile and AgentRun remain distinct.
6. Executor is visible but does not dominate product terminology.
7. Blockers are actionable.
8. Unknown/unavailable are distinct.
9. Evidence is factual.
10. Test absence is not represented as success.
11. Run completion and merge state are distinct.
12. UI does not invent workflow state.
13. No fake progress percentages.
14. Table/list information uses tables/lists, not card grids.
15. Activity derives from canonical events.
16. Office animation derives from canonical events/state.
17. Security-sensitive actions display scope before approval.
18. Historical Runs preserve their own workflow/executor truth.
19. Empty states provide the next real action.
20. Accessibility does not depend on Office View.

---

## 176. Next Document

This information architecture is finalized by:

```text
MVP_ACCEPTANCE.md
```

The next document should define the implementation acceptance matrix for Phase 1 through Office View, including functional, security, workflow, executor, worktree, realtime, frontend, testing, and non-goal gates.
