# Agent Office — Event Contract

Status: Draft  
Version: 0.1  
Scope: Normalized event envelope, taxonomy, ordering, idempotency, redaction, persistence, and realtime delivery

---

## 1. Purpose

This document defines the canonical event contract for Agent Office.

Agent Office integrates multiple executor runtimes such as Codex, Antigravity, OpenClaw, and future providers. Each executor may expose different event formats, lifecycle semantics, timestamps, identifiers, and capabilities.

The purpose of this contract is to normalize those differences into a provider-neutral event model that can be consumed consistently by:

- Workflow Orchestrator
- Run Coordinator
- AgentRun Coordinator
- Workspace Coordinator
- Review Service
- Evidence Service
- Audit
- Operations UI
- Activity Timeline
- Office View

The event model must remain truthful, safe, idempotent, and attributable.

---

## 2. Event Model Principles

Agent Office events follow these principles:

1. Events describe observed or orchestrated facts.
2. Events are not a replacement for current durable state.
3. Provider raw payloads are not canonical events.
4. Events are normalized before entering core application logic.
5. Events are append-oriented.
6. Events are immutable after persistence except for explicit redaction metadata.
7. Events must be secret-safe.
8. Events must identify Project and Run scope.
9. Events must preserve source attribution.
10. Duplicate delivery must not create duplicate workflow effects.
11. Network arrival order must not be treated as causal truth.
12. Missing provider detail must remain unavailable, not invented.

---

## 3. Canonical Event Envelope

Every normalized event should conform conceptually to:

```json
{
  "id": "evt_...",
  "schema_version": "1",
  "event_type": "agent.started",
  "project_id": "prj_...",
  "run_id": "run_...",
  "agent_run_id": "ar_...",
  "source": "EXECUTOR",
  "source_ref": "opaque-safe-reference",
  "occurred_at": "2026-09-12T10:00:00Z",
  "recorded_at": "2026-09-12T10:00:01Z",
  "sequence": null,
  "correlation_id": "corr_...",
  "causation_id": "evt_...",
  "payload": {},
  "redaction": {
    "applied": false,
    "fields_removed": []
  }
}
```

Not every field is required for every event.

---

## 4. Required Event Fields

Minimum required fields:

```text
id
schema_version
event_type
project_id
run_id
source
occurred_at
recorded_at
payload
```

`agent_run_id` is required for agent-scoped events.

---

## 5. Event ID

`id` is the stable Agent Office identifier for one persisted normalized event.

Recommended:

```text
UUIDv7
```

or another time-sortable UUID if implementation support is reliable.

The ID must not encode:

- provider name
- Project path
- secret data
- host information

---

## 6. External Event Identity

Some providers may expose stable event IDs.

Store them separately:

```text
external_event_id
executor_id
executor_session_ref
```

Use these for deduplication where possible.

Do not replace Agent Office `Event.id` with an untrusted provider identifier.

---

## 7. Event Type

Canonical event names use:

```text
domain.action
```

or where necessary:

```text
domain.subdomain.action
```

Examples:

```text
run.created
run.started
run.blocked
agent.started
agent.completed
workspace.changed
test.completed
review.finding.created
```

Avoid provider-specific names in canonical event types.

Bad:

```text
codex.thread.finished
```

Good:

```text
agent.completed
```

with provider metadata safely retained in source references.

---

## 8. Event Source

Canonical sources:

```text
USER
SYSTEM
ORCHESTRATOR
EXECUTOR
WORKSPACE
TEST
REVIEW
EVIDENCE
AUDIT
```

`source` identifies the logical producer of the canonical event, not necessarily the transport.

---

## 9. Source Reference

`source_ref` is an optional safe opaque reference.

Examples:

```text
Codex session ID
Antigravity run ID
OpenClaw session ID
Git workspace ID
test execution ID
```

It must never contain credentials.

---

## 10. Occurred vs Recorded Time

Two timestamps are required because external events may arrive late.

```text
occurred_at
```

Time the event is believed to have happened.

```text
recorded_at
```

Time Agent Office durably recorded it.

Do not assume:

```text
occurred_at == recorded_at
```

---

## 11. Timestamp Rules

Persist timestamps in UTC.

Transport format:

```text
ISO 8601
```

Example:

```text
2026-09-12T10:15:43.284Z
```

Frontend may render local time.

---

## 12. Sequence

`sequence` is optional.

Use only if the source provides a meaningful monotonic sequence.

Do not fabricate sequence numbers across providers.

Where unavailable:

```text
sequence = null
```

---

## 13. Correlation ID

`correlation_id` groups related operations.

Example:

```text
Run starts AgentRun
→ executor start request
→ executor acknowledgement
→ agent.started
```

All may share a correlation ID.

This aids tracing without changing domain identity.

---

## 14. Causation ID

`causation_id` may point to the event that directly caused another event.

Example:

```text
review.finding.created
      ↓
remediation.started
```

`remediation.started.causation_id` may reference the finding creation event.

Causation is optional where not provable.

---

## 15. Payload

Payload contains event-specific normalized data.

Rules:

- bounded size
- schema-controlled
- secret-safe
- no arbitrary provider dump
- no full repository source by default
- no raw environment
- no raw Authorization headers
- no access tokens
- no unbounded logs

---

## 16. Redaction Metadata

If adapter or ingestion logic removes sensitive content:

```json
{
  "redaction": {
    "applied": true,
    "fields_removed": [
      "headers.authorization",
      "env.API_KEY"
    ]
  }
}
```

Do not store the removed values elsewhere in the event.

---

## 17. Event Taxonomy Overview

Core event domains:

```text
project.*
task.*
run.*
workflow.*
stage.*
agent.*
executor.*
workspace.*
command.*
test.*
review.*
remediation.*
verification.*
evidence.*
artifact.*
approval.*
audit.*
```

Not every domain must be implemented in MVP.

Implemented-domain boundary:

```text
Phase 3 implementation  project, task, run, workflow, stage, agent,
                        executor (executor.session.reconciled), remediation,
                        verification

Phase 4 implementation  review (review.finding.*), evidence, artifact,
                        command, test, workspace, git, approval

Phase 8 implementation  audit.*   (an operational audit domain, distinct from
                        AuditRecord — see §56)
```

Phase 3 emits no event in the Phase 4 implementation rows. It performs no
repository mutation, runs no command, executes no test, and creates no Finding
or Evidence, so emitting any event in those domains would assert a fact that was
never established. This boundary is defined in
`docs/architecture/ADR-0001-phase3-orchestration-evidence-boundary.md`.

---

## 18. Project Events

Initial events:

```text
project.created
project.updated
project.archived
project.repository.validated
project.repository.validation_failed
```

Project events are generally control-plane events.

---

## 19. Task Events

Initial events:

```text
task.created
task.updated
task.archived
```

Task objective changes should be audited.

A started Run retains its historical Task snapshot.

---

## 20. Run Events

Initial events:

```text
run.created
run.planning.started
run.ready
run.started
run.blocked
run.resumed
run.reviewing
run.remediating
run.verifying
run.completed
run.failed
run.cancel.requested
run.cancelled
```

---

## 21. Run Created

Example:

```json
{
  "event_type": "run.created",
  "project_id": "prj_1",
  "run_id": "run_1",
  "source": "USER",
  "payload": {
    "task_id": "task_1",
    "workflow_snapshot_id": "wf_snap_1"
  }
}
```

Do not include Task full prompt if it may contain sensitive material unless explicitly needed.

---

## 22. Run Blocked

Required payload:

```text
reason_code
summary
required_action?
```

Example:

```json
{
  "event_type": "run.blocked",
  "payload": {
    "reason_code": "EXECUTOR_UNAVAILABLE",
    "summary": "The selected executor is unavailable.",
    "required_action": "Choose another executor or retry later."
  }
}
```

---

## 23. Run Completed

Example:

```json
{
  "event_type": "run.completed",
  "payload": {
    "completion_mode": "READY_FOR_REVIEW",
    "open_blockers": 0
  }
}
```

Do not imply merge/deploy status unless separately proven.

---

## 24. Workflow Events

Initial events:

```text
workflow.snapshot.created
workflow.validated
workflow.validation_failed
workflow.node.ready
workflow.node.blocked
workflow.node.skipped
```

These are useful for explainability.

---

## 25. Stage Events

Initial events:

```text
stage.ready
stage.started
stage.waiting
stage.completed
stage.blocked
stage.failed
stage.skipped
stage.cancelled
```

---

## 26. Stage Ready

Payload may include:

```text
stage_key
reason
eligible_nodes
```

Do not include large workflow definitions.

---

## 27. Stage Skipped

Required:

```text
stage_key
reason_code
summary
```

Example:

```json
{
  "event_type": "stage.skipped",
  "payload": {
    "stage_key": "ux-review",
    "reason_code": "CONDITION_FALSE",
    "summary": "No UI changes were recorded for this run."
  }
}
```

---

## 28. Agent Events

Initial events:

```text
agent.created
agent.start.requested
agent.started
agent.activity
agent.waiting
agent.completed
agent.failed
agent.blocked
agent.cancel.requested
agent.cancelled
agent.result.recorded
```

---

## 29. Agent Created

Represents durable AgentRun creation.

Example payload:

```json
{
  "agent_profile_id": "backend-developer",
  "executor_id": "codex-local",
  "stage_key": "implementation"
}
```

---

## 30. Agent Start Requested

Emitted after durable intent is recorded but before provider acknowledgement.

This is important for crash recovery.

```text
AgentRun STARTING
→ agent.start.requested
→ external side effect
```

---

## 31. Agent Started

Only emit when provider acknowledgement or reliable local start evidence exists.

Do not emit simply because Agent Office attempted a start call.

---

## 32. Agent Activity

`agent.activity` is optional and must remain factual.

Allowed examples:

```text
Executing tests
Waiting for approval
Applying patch
Reviewing files
```

only when provider/tool telemetry explicitly supports them.

Do not synthesize:

```text
Thinking deeply
Almost finished
72% complete
```

---

## 33. Agent Waiting

Required payload:

```text
reason_code
summary
```

Potential reasons:

```text
WAITING_FOR_DEPENDENCY
WAITING_FOR_APPROVAL
WAITING_FOR_EXECUTOR
WAITING_FOR_REVIEW
WAITING_FOR_RECONCILIATION
```

---

## 34. Agent Completed

`agent.completed` means the AgentRun finished its assignment successfully.

It does not mean:

- Run completed
- review passed
- changes merged
- tests passed unless separately evidenced

---

## 35. Agent Failed

Payload:

```text
failure_code
safe_summary
retryable?
```

Example:

```json
{
  "event_type": "agent.failed",
  "payload": {
    "failure_code": "EXECUTOR_START_FAILED",
    "safe_summary": "Executor failed before the assignment started.",
    "retryable": true
  }
}
```

---

## 36. Executor Events

Initial events:

```text
executor.registered
executor.status.changed
executor.capabilities.updated
executor.session.started
executor.session.reconciled
executor.session.lost
executor.quota.unavailable
```

Only emit quota events when the executor exposes a reliable signal.

---

## 37. Executor Status Changed

Payload:

```text
previous_status
new_status
reason_code?
summary?
```

Never expose raw provider error bodies.

---

## 38. Workspace Events

Initial events:

```text
workspace.allocation.requested
workspace.created
workspace.ready
workspace.changed
workspace.release.requested
workspace.released
workspace.failed
workspace.orphaned
workspace.conflict.detected
```

---

## 39. Workspace Created

Payload may include:

```text
workspace_id
workspace_kind
access_mode
base_revision?
```

Avoid absolute path in general activity payload.

---

## 40. Workspace Changed

Payload must be summary-oriented.

Example:

```json
{
  "event_type": "workspace.changed",
  "payload": {
    "files_changed": 7,
    "insertions": 121,
    "deletions": 34
  }
}
```

Do not place full diff text into the event.

---

## 41. Workspace Conflict

Example:

```json
{
  "event_type": "workspace.conflict.detected",
  "payload": {
    "reason_code": "WRITE_SCOPE_OVERLAP",
    "summary": "Two write assignments require overlapping paths."
  }
}
```

---

## 42. Command Events

Potential events:

```text
command.requested
command.allowed
command.approval.required
command.approved
command.denied
command.started
command.completed
command.failed
```

MVP may implement only those required by policy enforcement.

---

## 43. Command Secret Safety

Never persist:

- complete environment
- credential-bearing command arguments
- shell history dumps
- secret file contents

If a command includes sensitive arguments, persist a sanitized representation.

---

## 44. Test Events

Initial events:

```text
test.started
test.completed
test.failed_to_start
```

---

## 45. Test Started

Payload:

```text
test_run_id
command_ref?
suite?
```

Avoid raw command if it contains unsafe data.

---

## 46. Test Completed

Payload:

```json
{
  "event_type": "test.completed",
  "payload": {
    "test_run_id": "test_1",
    "passed": 142,
    "failed": 2,
    "skipped": 3,
    "exit_code": 1,
    "duration_ms": 38211,
    "evidence_id": "evd_1"
  }
}
```

Unknown counts remain null.

Do not convert absent values to zero.

---

## 47. Review Events

Initial events:

```text
review.started
review.finding.created
review.finding.acknowledged
review.finding.remediating
review.finding.resolved
review.finding.accepted_risk
review.completed
```

---

## 48. Review Finding Created

Payload should reference durable Finding ID.

```json
{
  "event_type": "review.finding.created",
  "payload": {
    "finding_id": "find_1",
    "severity": "BLOCKER",
    "category": "SECURITY",
    "title": "Authorization check missing"
  }
}
```

Detailed description belongs in Finding storage and may be omitted from high-frequency activity streams.

---

## 49. Finding Resolved

Payload:

```text
finding_id
resolver_agent_run_id?
resolution_type
```

Resolution types:

```text
REMEDIATED
ACCEPTED_RISK
INVALIDATED
```

`ACCEPTED_RISK` requires attributable user approval.

---

## 50. Remediation Events

Initial events:

```text
remediation.started
remediation.completed
remediation.failed
remediation.cycle.exhausted
```

---

## 51. Verification Events

Initial events:

```text
verification.started
verification.check.started
verification.check.completed
verification.failed
verification.completed
```

---

## 52. Verification Check

Example payload:

```json
{
  "event_type": "verification.check.completed",
  "payload": {
    "check_type": "BUILD",
    "status": "PASSED",
    "evidence_id": "evd_build_1"
  }
}
```

---

## 53. Evidence Events

Initial events:

```text
evidence.created
evidence.updated
evidence.unavailable
artifact.created
artifact.deleted
```

Evidence content and artifact bytes are not carried directly in the event.

---

## 54. Evidence Created

Payload:

```text
evidence_id
kind
status
summary
artifact_id?
```

---

## 55. Approval Events

Potential events:

```text
approval.requested
approval.approved
approval.rejected
approval.expired
approval.cancelled
```

---

## 56. Audit Events

Operational Event and AuditRecord remain distinct.

A user-facing event may be accompanied by an AuditRecord.

Example:

```text
run.cancel.requested
```

Operational event.

```text
USER requested cancellation of Run run_1
```

Audit record.

### Phase 3 implementation status

Phase 3 implements the AuditRecord store separately from the Event store. An
audit record is never written as an Event, and an audit record never carries
event payload semantics.

Audited interventions in Phase 3:

```text
RUN_CANCELLATION_REQUESTED
RUN_RESUME_REQUESTED
RUN_RECONCILIATION_REQUESTED
RUN_EXECUTOR_SELECTED
```

Each of these is accompanied by the operational Event that §30 already defines
for the action — for example `run.cancel.requested` — so the two histories
describe the same intervention from different angles rather than duplicating it.

No `audit.*` operational Event is introduced in Phase 3.

---

## 57. Provider Raw Event Boundary

Raw provider events must first enter adapter-local handling.

Conceptually:

```text
Provider raw event
      ↓
Executor Adapter
      ↓
validate
sanitize
normalize
      ↓
Canonical Event
```

Core services should not parse provider-specific JSON directly.

---

## 58. Raw Event Retention

MVP default:

```text
do not retain raw provider payloads
```

unless required for diagnostics and explicitly safe.

If raw retention is introduced later:

- opt-in
- encrypted or protected
- bounded retention
- redacted
- not exposed through general API

---

## 59. Event Validation

Before persistence validate:

- schema version
- known event type
- Project scope
- Run scope
- AgentRun scope where required
- timestamp format
- payload schema
- payload size
- redaction policy
- no forbidden secret fields

Invalid normalized events are rejected or quarantined.

---

## 60. Event Schema Registry

Maintain event schemas by:

```text
event_type + schema_version
```

Example:

```text
agent.started / 1
test.completed / 1
```

Adapters target canonical schema versions.

---

## 61. Event Versioning

Breaking payload change requires new schema version.

Do not silently reinterpret historical payloads.

Readers should:

- understand supported versions
- fail safely on unsupported versions
- preserve unknown historical events where practical

---

## 62. Idempotency

Event ingestion must tolerate duplicates.

Primary strategies:

1. external stable event ID
2. deterministic deduplication key
3. domain transition idempotency
4. unique persistence constraint where appropriate

---

## 63. Deduplication Key

Potential form:

```text
executor_id
+ executor_session_ref
+ external_event_id
```

If provider lacks event IDs, use bounded fallback only when safe.

Do not aggressively deduplicate distinct events merely because payloads look similar.

---

## 64. Duplicate Event Result

Duplicate event ingestion should return a non-error idempotent result.

Example:

```text
already_recorded = true
```

It must not repeat workflow side effects.

---

## 65. Ordering

Events may arrive:

- in order
- out of order
- duplicated
- delayed

Core state transition guards must tolerate these conditions.

---

## 66. Event Arrival vs Causality

Example:

```text
agent.completed
```

may arrive before a delayed:

```text
agent.activity
```

The late activity event may still be persisted for history but must not transition AgentRun back to RUNNING.

---

## 67. Sequence-Aware Reconciliation

If provider supplies reliable monotonic sequence:

```text
sequence
```

may assist reconciliation.

Do not require it across all executors.

---

## 68. State Transition Guard

Event persistence and state transition are related but separate.

Example:

```text
record event
      ↓
attempt transition
      ↓
if stale:
  preserve event
  do not regress state
```

A historical event may be valid even when it no longer changes current state.

---

## 69. Event Processing Result

Conceptual result:

```text
EventProcessingResult
├── persisted
├── duplicate
├── state_changed
├── ignored_for_state_reason?
└── diagnostics?
```

Useful for adapter debugging and tests.

---

## 70. Event Persistence

Initial persistence:

```text
SQLite
```

Potential columns:

```text
id
schema_version
event_type
project_id
run_id
agent_run_id
source
source_ref
occurred_at
recorded_at
sequence
correlation_id
causation_id
payload_json
redaction_json
external_event_id
executor_id
```

Exact migration design belongs to implementation.

---

## 71. Event Indexing

Likely indexes:

```text
run_id, recorded_at
agent_run_id, recorded_at
project_id, recorded_at
event_type
external_event_id + executor_id
```

Avoid excessive indexing before usage proves need.

---

## 72. Payload Size Limit

Canonical payloads must be bounded.

Initial recommendation:

```text
<= 64 KiB serialized
```

Large data becomes an Artifact and Event references its ID.

Exact limit may be adjusted during implementation.

---

## 73. Event Retention

MVP:

```text
retain events
```

for historical Runs.

No automatic deletion until retention policy is designed.

Large logs must not be represented as individual unbounded events.

---

## 74. Event Stream API

Potential endpoint:

```text
GET /api/runs/{run_id}/events
```

Supports:

- pagination
- event type filter
- agent_run_id filter
- recorded_at ordering

---

## 75. Realtime Stream

Initial preferred transport:

```text
SSE
```

Potential endpoint:

```text
GET /api/runs/{run_id}/events/stream
```

SSE emits normalized safe events.

---

## 76. SSE Event ID

Use persisted Event ID as SSE `id` where practical.

This allows browser resume using:

```text
Last-Event-ID
```

---

## 77. SSE Reconnect

On reconnect:

1. client sends last event ID
2. server replays later persisted events
3. stream resumes
4. duplicates are acceptable if client handles IDs

Do not rely on transient in-memory-only events.

---

## 78. Realtime Delivery Semantics

Target:

```text
at-least-once delivery
```

not exactly once.

Consumers must handle duplicate Event IDs.

---

## 79. UI Event Consumption

UI should use events for:

- activity feed
- immediate updates
- Office animation triggers
- transient notifications

UI should periodically or strategically reconcile canonical state through REST.

Do not rely solely on SSE to know current truth.

---

## 80. Office View Event Consumption

Office View may react to:

```text
agent.started
agent.waiting
agent.completed
agent.failed
review.finding.created
test.started
test.completed
```

But Office state must reconcile against AgentRun status.

Animation is never authoritative.

---

## 81. Activity Feed

Activity feed should display concise normalized messages.

Examples:

```text
Backend Developer started
QA completed 142 tests: 140 passed, 2 failed
Security Reviewer created 1 blocker
Run is waiting for remediation
```

Avoid raw provider chatter.

---

## 82. Activity Message Generation

Preferred:

```text
event_type + structured payload
→ deterministic renderer
```

rather than AI-generated activity prose.

This keeps history stable and auditable.

---

## 83. Secret Redaction

Redact at adapter boundary and again at canonical ingestion where practical.

Potential secret indicators:

```text
Authorization
Bearer
api_key
apikey
token
secret
password
cookie
set-cookie
private_key
```

Do not rely solely on regex for all security.

Structured provider payloads should have field-aware redaction.

---

## 84. Environment Variables

Never persist complete environment maps.

If an event must identify configuration availability:

Good:

```text
DATADOG_API_KEY configured = true
```

Bad:

```text
DATADOG_API_KEY = actual-secret
```

---

## 85. Filesystem Paths

Prefer:

```text
repository-relative path
```

in Event payload.

Avoid exposing:

```text
/Users/user/...
```

through regular UI/API unless operationally necessary.

---

## 86. Source Code

Do not include full source files in event payload.

A review Finding may include:

```text
path
line range
symbol
short summary
```

Detailed patch belongs in Artifact or controlled diff endpoint.

---

## 87. Command Output

Command stdout/stderr may contain secrets or huge output.

Default event payload:

```text
exit_code
duration
summary
artifact_id?
```

Detailed logs go to sanitized Artifact when needed.

---

## 88. Test Output

Likewise:

```text
counts
exit code
duration
evidence ID
```

rather than full test output in the Event.

---

## 89. Error Handling

Errors should use stable codes.

Example:

```json
{
  "failure_code": "EXECUTOR_UNAVAILABLE",
  "safe_summary": "The executor could not be reached."
}
```

Do not expose raw stack trace in UI event.

Detailed developer logs remain local and sanitized.

---

## 90. Event Security Levels

Optional future classification:

```text
PUBLIC_SAFE
LOCAL_SAFE
SENSITIVE
```

MVP may avoid formal levels if all canonical events are already safe for authenticated local UI.

---

## 91. Event Authorization

Every Event belongs to a Project and Run.

Future multi-user mode must authorize event access through Run/Project ownership.

MVP is local-first but should preserve scope in every record.

---

## 92. Cross-Project Safety

An event received for:

```text
project_id = A
run_id belonging to project B
```

is invalid.

Reject and diagnose.

Never silently reassign.

---

## 93. Agent Scope Safety

Agent-scoped event:

```text
agent_run_id
```

must belong to the stated `run_id`.

Mismatch is invalid.

---

## 94. Executor Scope Safety

Provider event session must map to the expected AgentRun/Executor relation.

Do not accept arbitrary external session IDs supplied by UI.

---

## 95. Event Ingestion API

Internal adapter-facing API concept:

```text
record_event(normalized_event)
```

Adapters should not directly update Run state tables.

They emit normalized events or call application services that perform transition + event persistence transactionally.

---

## 96. Internal vs External Event API

Do not expose general public:

```text
POST /events
```

that allows arbitrary event injection.

MVP ingestion should be internal/trusted.

ReferenceExecutor can use an internal test interface.

---

## 97. Transaction Semantics

Where possible:

```text
validate event
persist event
apply state transition
persist resulting state
```

should occur atomically.

External side effects occur outside DB transaction boundaries.

---

## 98. Derived Events

Orchestrator may emit a new canonical event as a consequence of another.

Example:

```text
agent.completed
      ↓
fan-in satisfied
      ↓
stage.completed
```

The new event gets its own Event ID and may set `causation_id`.

---

## 99. Event Chains

Example:

```text
agent.completed
      ↓
stage.completed
      ↓
stage.ready
      ↓
agent.created
      ↓
agent.start.requested
```

This sequence provides a clear operational history.

---

## 100. Workflow Transition Event Rule

Do not emit:

```text
stage.completed
```

unless stage state was durably transitioned to COMPLETED.

Event describes committed state, not intended state.

---

## 101. Intent Events

Some events explicitly describe intent:

```text
agent.start.requested
run.cancel.requested
workspace.release.requested
```

These are valid because the event type names the request rather than claiming completion.

---

## 102. Completion Event Rule

Completion events require evidence of completion.

Examples:

```text
workspace.released
agent.cancelled
run.completed
```

must not represent mere requests.

---

## 103. Event Replay

MVP does not require rebuilding all state exclusively from Events.

However, replay should be useful for:

- activity timeline
- debugging
- test assertions
- Office View playback

Current state remains separately stored.

---

## 104. Event Playback

Future Office View may support historical playback:

```text
Run completed
→ replay normalized Events
→ visualize agent lifecycle
```

Playback must indicate it is historical, not live.

---

## 105. Event Filtering

Potential filters:

```text
event_type
source
agent_run_id
stage_key
occurred_after
occurred_before
```

Run scope remains mandatory.

---

## 106. Event Pagination

Use cursor pagination where practical for stable activity history.

Potential cursor:

```text
recorded_at + event_id
```

Avoid offset for high-volume event streams if it becomes unstable.

---

## 107. Event Volume Control

High-frequency provider telemetry must be sampled or summarized before canonical persistence.

Example:

Bad:

```text
agent.activity emitted every 50 ms
```

Good:

```text
meaningful tool/activity state changes only
```

---

## 108. Heartbeats

Do not expose provider heartbeats as user-facing activity events unless they matter operationally.

Heartbeats may remain adapter-local health signals.

---

## 109. Token Stream

Token-by-token model output is not part of canonical event history.

If chat transcript is later supported, treat it as separate session content.

Do not flood Event Store with tokens.

---

## 110. Tool Events

If Executor provides tool lifecycle:

```text
tool.started
tool.completed
tool.failed
```

Agent Office may normalize them in a future extension.

MVP only needs tool events that materially improve observability.

---

## 111. Tool Secret Safety

Tool arguments may contain credentials.

Canonical tool events should contain:

```text
tool category
safe operation summary
status
duration
```

not raw arguments by default.

---

## 112. File Change Events

Avoid one event per filesystem write.

Prefer meaningful snapshots:

```text
workspace.changed
```

after an agent step or scan interval.

---

## 113. Git Events

Potential events:

```text
git.base_revision.recorded
git.diff.updated
git.commit.created
git.integration.ready
```

MVP must not create `git.commit.created` unless auto/manual commit actually occurred.

---

## 114. Merge Events

Future events:

```text
integration.started
integration.completed
integration.conflict
git.merge.completed
```

Do not represent unmerged work as merged.

---

## 115. Quota Events

Only if factual provider signal exists:

```text
executor.quota.exhausted
executor.quota.restored
```

Do not infer exact reset times without provider support.

---

## 116. Cost Events

Only if executor exposes trustworthy cost data.

Potential:

```text
executor.cost.updated
```

If unavailable, omit.

---

## 117. User Interaction Events

Potential:

```text
user.executor.selected
user.run.cancelled
user.approval.granted
user.risk.accepted
```

These may be represented primarily as AuditRecords instead of Event feed depending on UI need.

---

## 118. Approval Requested

Payload:

```text
approval_id
approval_type
summary
```

Do not include secret command content.

---

## 119. Approval Resolved

Payload:

```text
approval_id
decision
```

Detailed identity belongs to AuditRecord.

---

## 120. Event-to-State Mapping

Examples:

```text
agent.started
→ AgentRun RUNNING

agent.waiting
→ AgentRun WAITING

agent.completed
→ AgentRun COMPLETED

agent.failed
→ AgentRun FAILED

stage.started
→ RunStageState RUNNING

stage.completed
→ RunStageState COMPLETED
```

Mappings are application logic, not frontend logic.

---

## 121. Stale Event Example

Current state:

```text
AgentRun COMPLETED
```

Late event arrives:

```text
agent.activity
```

Action:

```text
persist historical event if valid
do not regress AgentRun status
```

---

## 122. Contradictory Terminal Events

Example:

```text
agent.completed
```

then:

```text
agent.failed
```

from same provider session.

Do not silently overwrite.

Reconciliation must:

- inspect provider source
- preserve both events
- raise diagnostic
- avoid pretending certainty

Run may become BLOCKED if truth cannot be established.

---

## 123. Event Diagnostics

Internal diagnostics may include:

```text
duplicate_event
stale_event
invalid_scope
unknown_schema
invalid_transition
redaction_applied
provider_contradiction
```

These diagnostics should be inspectable for troubleshooting.

---

## 124. ReferenceExecutor Events

ReferenceExecutor should emit deterministic canonical events directly through the same normalization contract.

Example scenario:

```text
agent.started
test.started
test.completed
agent.completed
```

This validates the event pipeline before real providers.

---

## 125. ReferenceExecutor Blocker Scenario

Example:

```text
agent.started
agent.completed
review.started
review.finding.created
review.completed
run.remediating
```

Then remediation events follow.

---

## 126. Event Test Requirements

At minimum test:

- valid event persistence
- unknown event type rejection
- unknown schema version rejection
- cross-project mismatch rejection
- AgentRun scope mismatch rejection
- duplicate provider event
- late event
- stale activity after completion
- contradictory terminal event
- secret redaction
- oversized payload
- SSE reconnect
- cursor pagination
- event ordering
- causation/correlation persistence
- no duplicate downstream workflow side effect

---

## 127. Event Fixture Examples

Fixtures should use neutral names:

```text
project-alpha
run-001
backend-agent-001
reference-executor
```

Avoid coupling tests to TDP or any personal filesystem path.

---

## 128. API DTO Safety

Event API DTO should not expose:

- raw provider payload
- absolute local workspace path unless explicitly authorized
- secret configuration
- provider credential reference
- internal exception stack trace

---

## 129. Activity API

Potential API:

```text
GET /api/runs/{run_id}/activity
```

This may return a human-oriented projection derived from canonical events.

It must not become a separate source of truth.

---

## 130. Office Projection API

Potential API:

```text
GET /api/runs/{run_id}/office
```

Returns current derived office state.

Realtime transitions may come from SSE.

---

## 131. Event Export

Future feature:

```text
export Run events
```

Possible formats:

```text
JSONL
JSON
```

Exports must preserve schema version and redaction metadata.

---

## 132. TDP Evidence Integration

Future integration may transform Agent Office Events into TDP evidence.

Example:

```text
test.completed
review.finding.resolved
verification.completed
```

becoming engineering evidence in TDP.

This is not MVP behavior.

---

## 133. Event Retention and Privacy

Future settings may support retention windows.

MVP should prioritize audit history.

Before introducing automatic deletion, define:

- Event retention
- Artifact retention
- Run retention
- privacy implications
- dependency on audit/evidence

---

## 134. Event Migration

Schema migration must not rewrite historical meaning.

If stored JSON structure changes, either:

- support old readers
- provide explicit migration preserving semantics
- version event payload

Do not silently reinterpret.

---

## 135. Event Integrity

Optional future integrity mechanisms:

```text
payload digest
artifact digest
event chain digest
```

Not required for MVP.

Avoid premature cryptographic chain complexity.

---

## 136. Event Store Failure

If durable event persistence fails during critical transition:

- do not claim the transition completed
- fail or block safely
- preserve current state consistency
- expose actionable diagnostic

---

## 137. Realtime Failure

If SSE delivery fails:

- canonical state remains durable
- browser reconnects
- missed events are replayed from persistence

Realtime transport failure must not corrupt workflow state.

---

## 138. Adapter Failure Before Normalization

If provider payload cannot be normalized:

- log sanitized diagnostic
- do not create misleading canonical event
- reconcile provider state if possible
- block Run if critical state cannot be determined

---

## 139. Unknown Provider Event

Unknown provider event may be:

- ignored with diagnostic
- adapter-local logged
- mapped later

Do not push unknown raw content into canonical Event Store automatically.

---

## 140. Event Contract Acceptance Criteria

The event contract is successful when:

1. Codex and Antigravity can map equivalent lifecycle facts to the same canonical event types.
2. UI can render Activity without provider-specific branching.
3. Office View can react to AgentRun lifecycle through canonical events.
4. duplicate provider delivery causes no duplicate workflow action.
5. late events do not regress state.
6. raw provider payloads never become public DTOs by default.
7. secrets are removed before persistence.
8. test results remain factual.
9. missing counts remain unknown.
10. Run/Project scope mismatch is rejected.
11. events survive application restart.
12. SSE reconnect can recover missed events.
13. historical Run activity remains inspectable after executor adapters change.

---

## 141. Primary Event Invariants

Mandatory invariants:

1. Every Event belongs to exactly one Project and Run.
2. Agent-scoped Events reference an AgentRun from the same Run.
3. Canonical Event types are provider-neutral.
4. Provider raw payload is never the canonical API model.
5. Duplicate Events do not duplicate state transitions.
6. Late Events do not regress terminal state.
7. UNKNOWN is never rewritten into SUCCESS.
8. Completion Events represent committed completion, not intent.
9. Request Events are named explicitly as requests.
10. Secret values never belong in Event payload.
11. Large content becomes Artifact, not Event payload.
12. SSE is delivery, not source of truth.
13. Event history is append-oriented.
14. State remains persisted separately.
15. Office View consumes Events but does not control workflow.
16. Network arrival order is not causal truth.
17. Event schema versions are explicit.
18. Historical Events retain original meaning.

---

## 142. Next Documents

This event contract is refined by:

```text
EXECUTOR_ADAPTER.md
WORKTREE_POLICY.md
SECURITY_MODEL.md
INFORMATION_ARCHITECTURE.md
MVP_ACCEPTANCE.md
```

The next document should define the executor adapter interface, capability negotiation, start/cancel/reconcile lifecycle, session handling, provider event normalization responsibilities, and fallback constraints.
