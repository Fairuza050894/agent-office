# Agent Office — Executor Adapter Contract

Status: Draft  
Version: 0.1  
Scope: Executor abstraction, capability negotiation, lifecycle, session handling, reconciliation, cancellation, event normalization, and fallback constraints

---

## 1. Purpose

This document defines how Agent Office integrates external AI coding runtimes while keeping the core system provider-neutral.

Initial executor targets include:

- Codex
- Antigravity
- OpenClaw
- ReferenceExecutor

Future executor integrations may include other coding agents or local runtimes without changing core workflow semantics.

The Executor Adapter Contract defines:

- adapter responsibilities
- capability negotiation
- executor availability
- start lifecycle
- status reconciliation
- cancellation lifecycle
- session references
- event normalization
- result normalization
- retry boundaries
- fallback policy
- security boundaries
- provider-specific metadata rules

---

## 2. Architectural Principle

Agent Office Core must depend on an executor abstraction rather than concrete provider APIs.

Conceptually:

```text
Workflow Orchestrator
        │
        ▼
Executor Port
        │
        ├── CodexAdapter
        ├── AntigravityAdapter
        ├── OpenClawAdapter
        └── ReferenceExecutor
```

The core must not contain scattered provider conditionals such as:

```text
if executor == codex
if executor == antigravity
if executor == openclaw
```

Provider behavior belongs inside adapters and capability-aware policies.

---

## 3. Executor vs Agent Role

Executor is not the same as AgentProfile.

Example:

```text
AgentProfile:
Backend Developer

Executor:
Codex
```

Another Run may use:

```text
AgentProfile:
Backend Developer

Executor:
Antigravity
```

Agent responsibilities remain stable while execution technology changes.

---

## 4. Executor Entity

Conceptual Executor fields:

```text
Executor
├── id
├── kind
├── name
├── status
├── configuration_ref
├── capability_snapshot
├── runtime_version?
├── last_checked_at?
├── created_at
└── updated_at
```

---

## 5. Executor Kind

Initial kinds:

```text
REFERENCE
CODEX
ANTIGRAVITY
OPENCLAW
```

Future kinds may be added without changing Workflow or Run domain types.

---

## 6. Executor Status

Canonical status:

```text
AVAILABLE
DEGRADED
UNAVAILABLE
DISABLED
UNKNOWN
```

Meaning:

```text
AVAILABLE
Executor is known to be usable for supported operations.

DEGRADED
Executor is reachable but one or more expected capabilities are impaired.

UNAVAILABLE
Executor cannot currently perform new execution.

DISABLED
User or system configuration intentionally disables this executor.

UNKNOWN
Agent Office cannot determine current availability.
```

UNKNOWN must not be interpreted as AVAILABLE.

---

## 7. Executor Port

Conceptual application port:

```python
class ExecutorAdapter:
    async def describe(self) -> ExecutorDescriptor:
        ...

    async def capabilities(self) -> CapabilityReport:
        ...

    async def health(self) -> ExecutorHealth:
        ...

    async def start(self, request: StartExecutionRequest) -> StartExecutionResult:
        ...

    async def get_status(self, session: ExecutorSessionRef) -> ExecutionStatus:
        ...

    async def cancel(self, session: ExecutorSessionRef) -> CancelExecutionResult:
        ...

    async def reconcile(self, session: ExecutorSessionRef) -> ReconciliationResult:
        ...

    async def stream_events(self, session: ExecutorSessionRef):
        ...

    async def fetch_result(self, session: ExecutorSessionRef) -> ExecutionResult:
        ...
```

Exact language/API may differ during implementation, but semantics must remain consistent.

---

## 8. Capability Model

Capabilities are explicit.

Potential capabilities:

```text
START_EXECUTION
STATUS_QUERY
CANCELLATION
EVENT_STREAM
SESSION_RESUME
STRUCTURED_RESULT
FILE_DIFF
TOOL_EVENTS
TOKEN_USAGE
SUBAGENTS
PARALLEL_AGENTS
VISION_INPUT
BROWSER_CONTROL
SHELL_EXECUTION
FILE_WRITE
```

---

## 9. Capability Support

Each capability reports:

```text
SUPPORTED
UNSUPPORTED
UNKNOWN
```

Optional metadata:

```text
limitations
source
checked_at
```

Example:

```json
{
  "capability": "CANCELLATION",
  "support": "SUPPORTED",
  "limitations": "Cancellation acknowledgement may be asynchronous."
}
```

---

## 10. No Fake Capability

If an executor does not expose token usage:

```text
TOKEN_USAGE = UNSUPPORTED
```

or:

```text
UNKNOWN
```

Do not estimate from prompt size or completion length.

Likewise, if subagent lifecycle is opaque, do not fabricate child AgentRuns.

---

## 11. Capability Snapshot

When an AgentRun starts, Agent Office should preserve the relevant capability snapshot used for execution.

This protects historical interpretation if provider behavior changes later.

---

## 12. Executor Descriptor

Conceptual descriptor:

```text
ExecutorDescriptor
├── executor_id
├── kind
├── display_name
├── runtime_version?
├── adapter_version
└── safe_metadata
```

No secrets.

---

## 13. Executor Configuration

Configuration may include:

```text
runtime path
local endpoint
connection mode
default model/profile
environment selection
adapter settings
```

Secrets must be referenced securely, not embedded into ordinary configuration.

---

## 14. Secret Boundary

Executor credentials belong to secure executor configuration.

Never place secret values in:

```text
Project
Task
Run
Event
Finding
Evidence metadata
AgentProfile
WorkflowDefinition
```

Adapters receive secrets only through secure runtime configuration.

---

## 15. Start Execution Request

Conceptual request:

```text
StartExecutionRequest
├── project_id
├── run_id
├── agent_run_id
├── agent_profile
├── instruction
├── workspace
├── access_mode
├── required_capabilities
├── execution_limits
└── safe_context
```

---

## 16. Start Request Rules

Before adapter start:

- Run is valid
- AgentRun is in STARTING
- executor is resolved
- required capabilities are checked
- workspace is READY where required
- project identity is validated
- safety policy is satisfied

Adapter must not independently change project selection.

---

## 17. Instruction Payload

Instruction composition happens outside provider-specific execution where practical.

Adapter receives a resolved instruction package.

It may reformat it for provider protocol but must not change workflow semantics.

---

## 18. Instruction Safety

Adapter must avoid injecting:

- plaintext secrets
- unrelated repository content
- hidden provider credentials
- raw local environment
- unrelated project context

Context must be bounded to the selected Project and Run.

---

## 19. Start Execution Result

Possible start outcomes:

```text
STARTED
ACCEPTED
REJECTED
FAILED
UNKNOWN
```

Conceptual result:

```text
StartExecutionResult
├── outcome
├── session_ref?
├── safe_summary?
├── retryable?
└── provider_metadata?
```

---

## 20. STARTED vs ACCEPTED

`STARTED` means provider confirms execution is running.

`ACCEPTED` means provider accepted the request but actual execution start is not yet confirmed.

AgentRun state mapping may differ:

```text
ACCEPTED
→ STARTING

STARTED
→ RUNNING
```

---

## 21. Unknown Start Result

If network failure occurs after request submission and Agent Office cannot determine whether execution started:

```text
StartExecutionResult = UNKNOWN
```

Do not automatically retry.

Run should enter safe reconciliation/blocking behavior.

This prevents duplicate side-effecting executions.

---

## 22. Executor Session Reference

Conceptual:

```text
ExecutorSessionRef
├── executor_id
├── opaque_session_id
├── created_at
└── safe_metadata
```

The session ID is provider-specific but treated as opaque by core domain logic.

---

## 23. Session Reference Safety

Session reference must not contain:

- secret token
- complete URL containing credentials
- cookie
- authorization header
- raw provider state

---

## 24. Status Query

Canonical execution status:

```text
PENDING
STARTING
RUNNING
WAITING
COMPLETED
FAILED
CANCELLED
UNKNOWN
```

Adapter maps provider state to canonical state.

---

## 25. Status Mapping

Example provider states:

```text
queued
working
finished
error
aborted
```

may normalize to:

```text
PENDING
RUNNING
COMPLETED
FAILED
CANCELLED
```

Mapping must be deterministic and tested.

---

## 26. Unknown Provider State

Unknown provider state maps to:

```text
UNKNOWN
```

not guessed.

Unknown state may block workflow progression.

---

## 27. Health Check

Executor health may inspect:

- runtime presence
- endpoint reachability
- authentication validity where safely testable
- provider availability
- adapter compatibility

Health checks must avoid consuming significant quota unnecessarily.

---

## 28. Health Result

Conceptual:

```text
ExecutorHealth
├── status
├── checked_at
├── reason_code?
├── safe_summary?
└── capability_changes?
```

---

## 29. Quota

Quota information is optional.

If provider exposes factual quota state:

```text
QuotaInfo
├── available?
├── remaining?
├── reset_at?
├── source
└── checked_at
```

Do not infer exact remaining quota from rate-limit failures alone.

---

## 30. Quota Exhaustion

When provider reports exhausted quota:

```text
ExecutorStatus = UNAVAILABLE or DEGRADED
```

depending on provider capabilities.

Agent Office may block new AgentRuns.

Existing sessions are handled separately.

---

## 31. Executor Selection Policy

Selection remains deterministic.

Priority:

```text
explicit AgentRun executor
→ Run executor
→ Project preferred executor
→ configured workflow default
→ user selection
```

Actual simplified implementation may use fewer layers, but order must remain explicit.

---

## 32. Fallback Constraint

Executor fallback must not be silent for high-risk work.

Default:

```text
fallback = ASK_USER
```

Possible policies:

```text
NO_FALLBACK
ASK_USER
ALLOW_CONFIGURED_FALLBACK
```

---

## 33. Fallback Eligibility

Automatic fallback may be considered only when:

- project policy allows it
- workflow policy allows it
- task risk allows it
- target executor satisfies required capabilities
- no uncertain side-effecting execution already exists

---

## 34. No Fallback After Unknown Start

If start result is UNKNOWN:

```text
do not start same assignment on another executor
```

until reconciliation proves the first executor did not start.

This prevents duplicate writes.

---

## 35. Event Stream

If supported:

```text
EVENT_STREAM = SUPPORTED
```

Adapter may provide normalized events in near-real-time.

If unsupported, Agent Office may poll status.

---

## 36. Event Normalization Responsibility

Adapter converts provider lifecycle into canonical Agent Office Events.

Example:

```text
provider: "task_started"
→ agent.started
```

Core workflow must not parse provider-native event names.

---

## 37. Raw Event Handling

Provider raw events remain adapter-local.

Default:

```text
normalize
sanitize
discard raw payload
```

unless diagnostic retention is explicitly enabled.

---

## 38. Event Stream Failure

If stream disconnects:

- preserve current canonical state
- retry/reconnect where safe
- query status where supported
- do not assume execution failed
- emit safe diagnostic

---

## 39. Polling Adapter

An adapter without streaming may use bounded polling.

Example:

```text
status every N seconds
```

Polling frequency must respect provider rate limits.

Do not poll aggressively.

---

## 40. Completion Result

Conceptual:

```text
ExecutionResult
├── outcome
├── summary
├── structured_output?
├── provider_result_ref?
├── artifacts*
├── usage?
└── safe_metadata
```

---

## 41. Execution Outcome

Canonical:

```text
SUCCESS
FAILURE
CANCELLED
UNKNOWN
```

UNKNOWN is important and must remain explicit.

---

## 42. Structured Result

If provider can return structured output:

```text
STRUCTURED_RESULT = SUPPORTED
```

Adapter validates it before passing to core.

Invalid structured result must not be trusted silently.

---

## 43. Free-Text Result

If only text is available, adapter may provide:

```text
summary
```

but workflow state should rely on durable execution outcome and independent gates, not merely agent wording.

---

## 44. Provider Result Reference

Store opaque provider result/session reference where useful.

Do not store raw complete conversation by default.

---

## 45. Result Evidence

Adapter may create evidence references for:

- provider result
- tool activity summary
- usage
- generated artifacts

Evidence creation still goes through Evidence Service.

---

## 46. File Diff Capability

Some executors may expose file changes.

If supported:

```text
FILE_DIFF = SUPPORTED
```

However, Agent Office should still independently inspect Git worktree state for authoritative changed-file summary.

Provider-reported diff is supplemental.

---

## 47. Tool Events

If supported:

```text
TOOL_EVENTS = SUPPORTED
```

Adapter may normalize meaningful tool activity.

Raw tool arguments remain sensitive by default.

---

## 48. Token Usage

If provider exposes factual usage:

```text
TokenUsage
├── input_tokens?
├── output_tokens?
├── total_tokens?
├── cached_tokens?
└── source
```

Unknown fields remain null.

---

## 49. Cost

Cost is separate from token usage.

Only record cost when provider exposes trustworthy billing/cost data.

Do not calculate unofficial cost unless explicitly designed later.

---

## 50. Subagent Capability

Executor may support native subagents.

Capability:

```text
SUBAGENTS
```

This does not automatically mean Agent Office can observe child lifecycle.

---

## 51. Native Subagent Modes

Possible modes:

```text
OPAQUE
OBSERVABLE
CONTROLLABLE
```

### OPAQUE

Provider internally uses subagents but Agent Office sees one AgentRun.

### OBSERVABLE

Provider exposes child lifecycle events.

### CONTROLLABLE

Agent Office can intentionally create/coordinate provider-native child agents.

MVP should not assume CONTROLLABLE.

---

## 52. Child Session Mapping

When observable:

```text
provider child session
→ ChildAgentRun or provider sub-session projection
```

Only map if identity and lifecycle are reliable.

Do not infer subagents from text such as "I asked another agent."

---

## 53. Parallel Agents Capability

`PARALLEL_AGENTS` indicates provider supports concurrent sessions.

It does not override Agent Office:

- workflow dependencies
- workspace safety
- global concurrency bounds
- project policies

---

## 54. Session Resume

If supported:

```text
SESSION_RESUME
```

Adapter may reconnect after Agent Office restart.

Resume must validate:

- same executor
- same session
- same Project
- same AgentRun
- workspace still valid

---

## 55. Resume Unsupported

If provider cannot resume:

- historical session remains recorded
- non-terminal AgentRun may require reconciliation
- do not fake resume using a new session without recording a new attempt

---

## 56. Reconciliation

Reconciliation determines external execution truth after interruption.

Conceptual result:

```text
ReconciliationResult
├── status
├── confidence
├── result_available
├── safe_summary
└── next_action
```

---

## 57. Reconciliation Status

Canonical:

```text
ACTIVE
COMPLETED
FAILED
CANCELLED
NOT_FOUND
UNKNOWN
```

---

## 58. Reconciliation Confidence

Potential:

```text
CONFIRMED
PARTIAL
UNKNOWN
```

Do not treat PARTIAL as confirmed success.

---

## 59. Restart Reconciliation

On Agent Office restart:

```text
non-terminal AgentRun
      ↓
adapter.reconcile(session)
      ↓
confirmed state
      ↓
workflow resumes safely
```

---

## 60. Missing Session

If provider reports session not found:

```text
NOT_FOUND
```

This does not automatically prove execution never happened.

Historical timing and provider semantics determine next action.

Default safe behavior:

```text
Run BLOCKED
```

until policy/user resolves uncertainty.

---

## 61. Cancellation Request

Conceptual adapter method:

```text
cancel(session)
```

Possible outcomes:

```text
REQUESTED
CONFIRMED_CANCELLED
ALREADY_TERMINAL
UNSUPPORTED
FAILED
UNKNOWN
```

---

## 62. Cancellation Semantics

`REQUESTED` does not mean cancelled.

Only:

```text
CONFIRMED_CANCELLED
```

or reliable reconciliation may map AgentRun to CANCELLED.

---

## 63. Cancellation Unsupported

If executor cannot cancel:

```text
CANCELLATION = UNSUPPORTED
```

High-risk long-running workflows may reject this executor before start if cancellation is required.

---

## 64. Cancellation Unknown

If cancel call outcome is UNKNOWN:

- do not release writable workspace
- do not start replacement agent
- reconcile first
- Run may become BLOCKED

---

## 65. Timeout

Adapter may support timeout configuration.

Timeout policy must distinguish:

- local request timeout
- provider execution timeout
- idle timeout
- maximum duration

A local HTTP timeout does not prove provider execution stopped.

---

## 66. Error Normalization

Provider-specific errors map to controlled codes.

Examples:

```text
EXECUTOR_UNAVAILABLE
AUTHENTICATION_FAILED
QUOTA_EXHAUSTED
START_REJECTED
START_RESULT_UNKNOWN
STATUS_UNAVAILABLE
CANCELLATION_UNSUPPORTED
CANCELLATION_FAILED
SESSION_NOT_FOUND
RESULT_UNAVAILABLE
PROTOCOL_ERROR
ADAPTER_INTERNAL_ERROR
```

---

## 67. Retryable Classification

Adapter may classify:

```text
retryable = true / false / unknown
```

Workflow policy makes final retry decision.

Adapter must not autonomously rerun work.

---

## 68. Authentication Failure

Authentication failure must:

- mark executor unavailable/degraded
- produce safe summary
- never log credential values
- never expose raw provider response containing secrets

---

## 69. Provider Rate Limit

Rate limit maps to:

```text
QUOTA_EXHAUSTED
```

or:

```text
RATE_LIMITED
```

depending on provider semantics.

Do not infer weekly/5-hour windows unless provider exposes them.

---

## 70. Adapter Diagnostics

Safe diagnostics may include:

```text
provider unreachable
unsupported version
event normalization failure
session reconciliation failure
capability changed
```

No secret values.

---

## 71. Adapter Versioning

Every adapter should expose:

```text
adapter_version
```

Historical Run records may include the adapter version used.

Useful when provider protocol evolves.

---

## 72. Runtime Version

When available, capture:

```text
runtime_version
```

Example:

```text
Codex CLI version
OpenClaw version
Antigravity client version
```

This is metadata, not workflow identity.

---

## 73. Provider Protocol Change

If provider changes incompatibly:

- adapter health becomes DEGRADED/UNAVAILABLE
- capability report updates
- existing historical Runs remain readable
- do not reinterpret old Event meaning

---

## 74. ReferenceExecutor

ReferenceExecutor is mandatory for foundation testing.

Characteristics:

```text
local
deterministic
no external AI
no network requirement
fully controllable scenarios
```

---

## 75. ReferenceExecutor Scenarios

Support at least:

```text
SUCCESS
START_FAILURE
RUN_FAILURE
WAITING
BLOCKER_REVIEW
CANCEL_REQUESTED
CANCEL_CONFIRMED
CANCEL_UNKNOWN
DUPLICATE_EVENT
LATE_EVENT
UNKNOWN_RESULT
```

---

## 76. ReferenceExecutor Purpose

Use it to validate:

- workflow orchestration
- event persistence
- SSE
- Office View
- remediation loops
- retry
- cancellation
- recovery
- capability negotiation

before integrating real providers.

---

## 77. Codex Adapter

CodexAdapter must be implemented only against public/stable integration surfaces available at implementation time.

Do not depend on undocumented internal state unless isolated behind experimental capability flags.

---

## 78. Codex Adapter Initial Responsibilities

Potential:

```text
detect runtime availability
start bounded task/session
capture safe session reference
query status if supported
stream/poll events if supported
request cancellation if supported
collect result
normalize lifecycle
```

Exact behavior must be verified against current Codex capabilities before implementation.

---

## 79. Antigravity Adapter

AntigravityAdapter follows the same contract.

Provider-specific teamwork/subagent functionality must map only when its lifecycle can be reliably observed.

Do not let Antigravity-specific concepts enter core Workflow domain.

---

## 80. OpenClaw Adapter

OpenClawAdapter may expose richer native subagent/session events.

Even then:

- Agent Office remains orchestration authority for Agent Office workflows
- OpenClaw internal delegation may operate in opaque or observable mode
- raw OpenClaw events require normalization

---

## 81. Adapter Mode

An adapter may support:

```text
SINGLE_AGENT
NATIVE_MULTI_AGENT
```

This describes provider execution style.

It does not change Agent Office domain concepts.

---

## 82. Adapter Capability Negotiation

At registration/startup:

```text
adapter
→ inspect runtime
→ produce capability report
→ persist safe snapshot
```

Capabilities may be refreshed periodically or on demand.

---

## 83. Capability Change

If capability changes:

```text
executor.capabilities.updated
```

New Runs use new capability state.

Active Runs retain the capability assumptions recorded at start and may reconcile if a required capability disappears.

---

## 84. Capability Compatibility

Before AgentRun starts:

```text
required capabilities
     vs
executor capability report
```

Result:

```text
COMPATIBLE
INCOMPATIBLE
UNKNOWN
```

UNKNOWN defaults to block when required capability is safety-critical.

---

## 85. Safety-Critical Capabilities

Examples:

```text
FILE_WRITE isolation
CANCELLATION for high-risk task
STATUS_QUERY for long-running task
```

If required safety capability is UNKNOWN:

```text
do not start
```

unless explicit user override exists.

---

## 86. Workspace Passing

Adapter should receive workspace through a controlled reference.

Example:

```text
WorkspaceExecutionContext
├── workspace_id
├── path
├── access_mode
├── repository_identity
└── base_revision
```

Absolute path may be present internally but should not leak to general API.

---

## 87. Working Directory

Executor must run against the assigned workspace, not an arbitrary current shell directory.

Adapter validates cwd before start where possible.

---

## 88. Repository Boundary

Adapter must not traverse unrelated sibling repositories unless explicitly granted.

Project boundary remains enforced by Agent Office.

---

## 89. Shell Access

If executor supports shell:

```text
SHELL_EXECUTION = SUPPORTED
```

but commands remain subject to Agent Office safety policy.

Provider-native shell permission is not enough by itself.

---

## 90. Command Interception

Where technically possible, executor commands should pass through:

```text
Command Policy
```

If provider does not allow interception, capability limitations must be explicit.

High-risk workflows may disallow such executor modes.

---

## 91. File Write

If executor can write files:

```text
FILE_WRITE = SUPPORTED
```

Write access remains bounded to assigned Workspace.

---

## 92. Browser Control

If executor supports browser:

```text
BROWSER_CONTROL = SUPPORTED
```

Browser automation may require separate network/security policy.

Not all projects need it.

---

## 93. Vision Input

If executor supports screenshot/image understanding:

```text
VISION_INPUT = SUPPORTED
```

UX review workflow may require this capability.

If unavailable, UX stage may be incompatible rather than silently skipped.

---

## 94. Model/Profile Selection

Adapter configuration may select provider model/profile.

Core may request abstract execution profile:

```text
FAST
STANDARD
HIGH_REASONING
VISION
```

Future feature.

MVP can use executor defaults.

---

## 95. Provider-Specific Prompt Formatting

Adapters may wrap or format instructions for provider syntax.

They must not alter:

- Task objective
- workflow constraints
- safety policy
- workspace identity

---

## 96. Provider-Specific System Prompt

If required, adapter may add a system-level executor wrapper.

It must preserve Agent Office instruction precedence.

---

## 97. Repository Instruction Files

Adapter may receive resolved repository guidance from orchestration layer.

It must not independently discover unrelated filesystem instruction files outside Project boundary.

---

## 98. Result Summary

Adapters should provide concise safe result summary.

Do not depend on model-generated final prose as the only source of changed files, test results, or verification.

Those facts must come from independent evidence where possible.

---

## 99. Agent Self-Reported Tests

If AI says:

```text
"all tests pass"
```

this is not equivalent to TestResult evidence unless Agent Office or trusted executor telemetry proves the command/result.

Store agent claim only as result summary if useful.

---

## 100. Executor Artifact

Provider may produce artifacts.

Adapter converts them to safe artifact references through Artifact/Evidence services.

Do not store arbitrary provider file references without validation.

---

## 101. Local File Artifact

For local provider output:

- validate path belongs to allowed workspace/provider artifact root
- prevent traversal
- inspect size
- sanitize display metadata
- optionally digest

---

## 102. Remote Artifact

Future remote provider artifact requires explicit download handling.

Do not blindly follow arbitrary remote URLs from model output.

---

## 103. Network Policy

Adapters may access only configured provider endpoints.

Provider base URLs must be validated.

Local-first adapters should prefer localhost where applicable.

---

## 104. SSRF Safety

If executor endpoint is configurable:

- allowlist schemes
- validate host
- distinguish local vs remote
- do not accept arbitrary runtime URL from Task text

---

## 105. TLS

Remote providers should use TLS.

Exceptions for localhost development may be explicitly configured.

---

## 106. Credential Storage

Credentials should use secure local secret storage where practical.

Potential mechanisms:

```text
OS keychain
environment injection
provider-native login/session
```

Avoid plaintext SQLite credential values.

---

## 107. Credential Reference

Persist only:

```text
credential_ref
```

or provider account label.

Never return actual credential via API.

---

## 108. Credential Rotation

Adapter should tolerate credential replacement without rewriting historical Runs.

Historical Run records reference Executor, not secret version.

---

## 109. Session Ownership

Every external session must map to exactly one AgentRun unless provider-native child sessions are explicitly modeled.

Do not reuse one provider session across unrelated Projects.

---

## 110. Cross-Project Session Safety

A session created for Project A must never be resumed in Project B.

Adapter validates expected Project/Run metadata before reuse.

---

## 111. Session Lifecycle

Conceptual:

```text
CREATED
ACTIVE
WAITING
TERMINAL
LOST
UNKNOWN
```

This may remain adapter-local rather than core domain state.

---

## 112. Session Cleanup

Do not destroy provider session metadata until:

- AgentRun terminal state is known
- required result collected
- retention policy permits cleanup

---

## 113. Session Retention

MVP may retain safe session references for debugging/resume.

No requirement to retain complete conversation content.

---

## 114. Conversation Content

Provider chat transcript is not automatically part of canonical Event Store.

If later exposed:

- separate storage
- explicit privacy rules
- bounded retention
- redaction
- access controls

---

## 115. Adapter Logging

Log:

```text
adapter name
operation
status
duration
safe error code
session reference hash/opaque ID
```

Do not log:

```text
credentials
full prompts by default
raw provider response
secret-bearing environment
```

---

## 116. Metrics

Safe adapter metrics:

```text
start latency
status query latency
active sessions
failed starts
cancellation success rate
event stream reconnect count
```

Avoid productivity scoring.

---

## 117. Provider Usage Metrics

If provider exposes:

```text
tokens
cost
quota
```

store as factual optional telemetry.

If unavailable, omit.

---

## 118. Retry Boundary

Adapter never autonomously retries an entire AgentRun unless the contract explicitly permits idempotent transport retry before external side effect.

Workflow Orchestrator owns assignment retry.

---

## 119. Transport Retry

Safe transport retry examples:

- GET status
- idempotent capability query
- event stream reconnect

Potentially unsafe:

- start execution
- submit write task
- cancel when outcome unknown

These require idempotency tokens or reconciliation.

---

## 120. Start Idempotency

If provider supports idempotency key:

```text
agent_run_id
```

or a derived stable token may be used.

If not, unknown start result must not be blindly retried.

---

## 121. Cancel Idempotency

Repeated cancel requests should be safe where provider supports them.

Adapter normalizes:

```text
already terminal
already cancelled
cancel requested
```

---

## 122. Result Fetch Idempotency

Fetching result should be read-only and safe to retry.

---

## 123. Provider Timeout

Timeout error classification must indicate whether outcome is:

```text
known not started
known failed
unknown
```

This distinction is critical.

---

## 124. Executor Unavailability

Availability may change after planning but before start.

Before each start, adapter/policy may recheck health.

Do not assume planning-time status remains valid indefinitely.

---

## 125. Executor Becomes Unavailable Mid-Run

Existing AgentRun may continue.

New AgentRuns may block.

Do not automatically cancel active sessions unless provider/policy requires it.

---

## 126. Executor Replacement Mid-Run

Replacement occurs only for future/retried AgentRuns.

Existing completed history remains associated with original Executor.

---

## 127. Mixed Executor Run

A Run may contain:

```text
Architect → Codex
Backend   → Codex
QA        → Antigravity
```

if workflow/project policy allows it.

Core domain supports this because Executor belongs at AgentRun level.

---

## 128. Default Executor Per Run

MVP may simplify UX by selecting one primary executor for a Run.

However, domain must not prevent future per-AgentRun executor selection.

---

## 129. Adapter Test Contract

Every real adapter must pass shared conformance tests.

Examples:

```text
describe
capabilities
health
start success
start rejection
start unknown
status
completion
failure
cancel request
cancel confirmation
cancel unknown
result
event normalization
redaction
reconcile
session mismatch
```

---

## 130. Shared Conformance Suite

Provide reusable test cases against an abstract fake provider.

This prevents semantic drift across adapters.

---

## 131. Provider-Specific Tests

Additionally test provider mappings independently.

No real paid provider calls in normal unit tests.

Use mocks/fakes/recorded safe fixtures.

---

## 132. Live Smoke Tests

Optional developer-only smoke tests may hit real runtimes.

They must be:

- opt-in
- excluded from normal CI
- secret-safe
- quota-aware
- non-destructive

---

## 133. Capability Fixture

Example:

```json
{
  "START_EXECUTION": "SUPPORTED",
  "STATUS_QUERY": "SUPPORTED",
  "CANCELLATION": "SUPPORTED",
  "EVENT_STREAM": "UNSUPPORTED",
  "TOKEN_USAGE": "UNKNOWN"
}
```

---

## 134. Adapter Registration

Executor adapters register with a central registry.

Conceptually:

```text
ExecutorRegistry
├── reference
├── codex
├── antigravity
└── openclaw
```

Core selects by Executor ID/Kind.

---

## 135. Missing Adapter

If Executor record references unavailable adapter code:

```text
ExecutorStatus = UNAVAILABLE
```

Historical records remain readable.

---

## 136. Disabled Adapter

User can disable an executor without deleting historical Runs.

---

## 137. Experimental Adapter

Adapters may be marked:

```text
STABLE
EXPERIMENTAL
DISABLED
```

UI should expose this honestly.

---

## 138. Experimental Capability

Provider-specific undocumented feature should not be treated as stable required capability.

If used:

- isolate behind adapter flag
- label experimental
- do not make core dependent on it

---

## 139. Provider Lock-In Check

Architecture review should reject designs where:

- Workflow depends on Codex-specific thread concepts
- Run requires Antigravity-specific teamwork naming
- Event type exposes OpenClaw raw lifecycle
- database schema stores provider-only columns in core tables unnecessarily

---

## 140. ReferenceExecutor First

Implementation order should be:

```text
Executor Port
→ ReferenceExecutor
→ conformance tests
→ orchestration validation
→ first real adapter
```

not:

```text
build Codex-specific integration first
→ abstract later
```

---

## 141. First Real Adapter Selection

Choose based on:

- stable public integration contract
- local controllability
- event/status visibility
- cancellation semantics
- session identity
- testing feasibility

Do not select solely because it is the user's favorite executor.

---

## 142. Provider Adapter Documentation

Each adapter should document:

```text
supported capabilities
unsupported capabilities
known limitations
authentication
runtime requirements
event mapping
cancellation semantics
recovery semantics
security notes
```

---

## 143. Executor Health UI

UI may show:

```text
Codex        Available
Antigravity  Unavailable
OpenClaw     Disabled
```

With factual reason.

Avoid fake latency/quality scores unless measured.

---

## 144. Executor Selection UI

User should see:

```text
Executor
[ Codex ▼ ]

Capabilities required by workflow:
✓ status query
✓ file write
✓ cancellation
```

If incompatible:

```text
Cannot run this workflow with selected executor.
```

---

## 145. Fallback UI

If selected executor unavailable:

```text
Codex is unavailable.

[ Retry ]
[ Choose executor ]
```

Automatic fallback is shown only if policy explicitly allows it.

---

## 146. Run History

Historical Run shows actual executors per AgentRun.

Do not rewrite history when Project preference changes later.

---

## 147. Adapter Security Invariant

Adapter code is privileged.

It can potentially access:

- credentials
- filesystem
- provider endpoint
- execution sessions

Therefore adapter interfaces must be narrow and reviewed carefully.

---

## 148. Adapter Dependency Boundary

Application layer defines ports.

Infrastructure implements adapters.

Domain must not import:

- provider SDK
- HTTP client implementation
- CLI subprocess implementation
- provider config parser

---

## 149. CLI-Based Adapter

Some executors may be integrated through CLI subprocess.

Requirements:

- explicit executable path
- bounded environment
- controlled cwd
- stdout/stderr capture bounds
- no shell interpolation where avoidable
- process identity tracking
- cancellation semantics
- timeout semantics
- sanitized logs

---

## 150. API-Based Adapter

API integration requirements:

- explicit base endpoint
- TLS where remote
- bounded timeout
- structured error normalization
- idempotency where supported
- secret-safe headers
- response size bounds
- retry rules

---

## 151. Local Socket Adapter

If local executor uses socket/localhost server:

- bind expected host
- validate endpoint
- reject arbitrary remote redirection
- timeout safely
- health check
- version negotiation if available

---

## 152. Adapter Process Isolation

Future high-risk execution may require:

```text
container
sandbox
VM
remote worker
```

The Executor Adapter contract should remain compatible by treating execution location as infrastructure metadata.

---

## 153. Local-First MVP

Initial supported deployment:

```text
Agent Office
+
local executor runtimes
+
local worktrees
```

No requirement for remote agent execution in MVP.

---

## 154. Result Unknown Policy

If final execution result is UNKNOWN:

```text
AgentRun remains unresolved
Run BLOCKED
```

User may reconcile or abandon.

Do not mark FAILED solely for convenience if truth is unknown.

---

## 155. Abandon Operation

Future explicit action:

```text
abandon unresolved AgentRun
```

This is a human/system decision, not provider fact.

Audit it separately.

---

## 156. Provider Session Lost

Potential event:

```text
executor.session.lost
```

Run may become BLOCKED.

Do not immediately retry write task.

---

## 157. Provider Session Recovered

Potential:

```text
executor.session.reconciled
```

Workflow may resume if state is confirmed.

---

## 158. Agent Office Restart

Adapter must support:

```text
load persisted session ref
→ reconcile
```

or report unsupported.

---

## 159. Safe Adapter Metadata

Allowed metadata examples:

```text
provider model name
runtime version
session label
capability flags
region/site
```

Forbidden:

```text
API key
cookie
access token
private prompt containing secrets
raw full environment
```

---

## 160. Adapter Error DTO

Safe error:

```text
code
summary
retryable
details_ref?
```

Do not expose raw stack trace to normal frontend.

---

## 161. Adapter Diagnostics Artifact

Detailed sanitized diagnostics may be stored as local artifact for developer troubleshooting.

Not shown by default.

---

## 162. Capability Negotiation Failure

If capability check itself fails:

```text
support = UNKNOWN
```

not UNSUPPORTED.

This distinction matters for temporary provider outages.

---

## 163. Executor Compatibility Result

Conceptual:

```text
ExecutorCompatibility
├── status
├── missing_capabilities*
├── unknown_capabilities*
├── warnings*
└── checked_at
```

Status:

```text
COMPATIBLE
INCOMPATIBLE
UNKNOWN
```

---

## 164. Workflow Start Gate

Run cannot move READY → RUNNING if selected required executor is INCOMPATIBLE.

UNKNOWN may block based on safety policy.

---

## 165. Per-Role Capability Requirements

Example:

```text
UX Reviewer
requires VISION_INPUT

Backend Developer
requires FILE_WRITE + SHELL_EXECUTION

QA
requires SHELL_EXECUTION
```

Workflow compatibility may therefore vary by AgentProfile.

---

## 166. Mixed Capability Resolution

If primary executor cannot satisfy one role:

```text
Run may use secondary executor
```

only if workflow/project policy permits mixed executors.

Otherwise block and ask user.

---

## 167. Model Quality Selection

Agent Office MVP does not rank AI model intelligence automatically.

It focuses on executor capability and policy.

Future model routing is separate.

---

## 168. Cost-Aware Selection

Not MVP.

If introduced later, cost must be factual and policy-driven.

---

## 169. Adapter Event Mapping Table

Each adapter should maintain an explicit mapping table.

Example:

```text
Provider Event      Canonical Event
-----------------------------------
started             agent.started
paused              agent.waiting
finished_success    agent.completed
finished_error      agent.failed
cancelled           agent.cancelled
```

Unknown provider events remain diagnostic until mapped.

---

## 170. Canonical Event Responsibility

Adapter may propose canonical Event.

Application ingestion validates:

- scope
- schema
- payload
- transition compatibility

Adapter is not trusted to bypass domain rules.

---

## 171. Executor-Initiated File Changes

Even when provider reports changed files, authoritative change evidence comes from Workspace/Git inspection.

---

## 172. Executor-Initiated Tests

Provider tool event may report tests.

Agent Office should capture actual command outcome where possible.

---

## 173. Executor-Initiated Review

Provider may self-review, but workflow independent reviewer rules still apply.

Self-review may become supplemental evidence only.

---

## 174. Executor-Generated Documentation

Documentation Agent may use any compatible executor.

Generated docs remain subject to workflow review and project write policy.

---

## 175. Adapter Availability Cache

Health/capabilities may be cached briefly.

Do not assume cached availability is permanent.

Recheck before critical start.

---

## 176. Executor Registration Validation

When registering executor:

- adapter exists
- config valid
- no plaintext secret stored
- health check attempted
- capability report obtained where possible

---

## 177. Executor Removal

Prefer:

```text
DISABLED
```

rather than deleting executor referenced by historical Runs.

---

## 178. Multiple Accounts

Future support may allow multiple configurations of same kind:

```text
Codex Personal
Codex Work
OpenClaw Local
OpenClaw Remote
```

Each has unique Executor ID.

---

## 179. Executor Identity

Executor ID identifies configuration instance, not just kind.

Example:

```text
executor_id = codex-personal
kind = CODEX
```

---

## 180. Quota Per Executor Instance

Quota belongs to executor/account instance.

Do not aggregate across accounts unless provider guarantees it.

---

## 181. Adapter State

Persistent adapter-specific state must be:

- bounded
- namespaced by executor
- secret-safe
- not relied upon as core domain truth

---

## 182. Migration

Adapter upgrades may migrate their own safe metadata.

Historical core state must remain readable.

---

## 183. Adapter Conformance Invariants

Every adapter must satisfy:

1. No provider-specific type leaks into core domain.
2. Capabilities are explicit.
3. UNKNOWN remains UNKNOWN.
4. Start ambiguity is never blindly retried.
5. Cancellation request is not cancellation confirmation.
6. Session refs are opaque.
7. Raw provider payloads are sanitized before canonical ingestion.
8. Secrets never enter normal Event payloads.
9. Project/Run/AgentRun scope is validated.
10. Result success does not imply Run completion.
11. Adapter does not mutate workflow directly.
12. Provider availability changes do not rewrite history.
13. Historical sessions remain attributable.
14. External errors normalize to safe codes.
15. Real provider calls are excluded from normal unit tests.
16. Worktree path assignment is respected.
17. Cross-project session reuse is forbidden.
18. Provider-native subagents are mapped only when observable.
19. Fallback is policy-controlled.
20. Adapter remains replaceable without domain redesign.

---

## 184. Acceptance Scenarios

The adapter architecture is acceptable when Agent Office can represent all of these without special-case domain changes:

```text
Scenario A
ReferenceExecutor runs full workflow.

Scenario B
Codex executes Backend Agent.
Antigravity executes QA Agent.

Scenario C
Executor unavailable before start.
Run blocks safely.

Scenario D
Start result unknown.
No duplicate fallback execution.

Scenario E
Cancellation requested and later confirmed.

Scenario F
Cancellation requested but provider state unknown.
Workspace remains protected.

Scenario G
Agent Office restarts and reconciles external session.

Scenario H
Provider event duplicated.
No duplicate downstream work.

Scenario I
Provider event arrives late.
No state regression.

Scenario J
Provider loses session.
Run becomes safely blocked.

Scenario K
Executor capability changes.
New Runs see new capability state.

Scenario L
Historical Run remains readable after adapter upgrade.
```

---

## 185. Implementation Order

Recommended:

```text
1. Define Executor Port
2. Implement capability model
3. Implement ReferenceExecutor
4. Implement shared conformance tests
5. Integrate Workflow Orchestrator
6. Implement health/compatibility UI
7. Choose first real adapter
8. Implement first real adapter
9. Dogfood against one real Project
10. Add second executor
```

---

## 186. First Real Adapter Gate

Do not start a real adapter until:

- ReferenceExecutor passes orchestration scenarios
- Worktree safety exists
- Event ingestion exists
- cancellation/reconciliation semantics are implemented
- secret storage approach is defined
- executor compatibility checks exist

---

## 187. Next Documents

This executor adapter contract is refined by:

```text
WORKTREE_POLICY.md
SECURITY_MODEL.md
INFORMATION_ARCHITECTURE.md
MVP_ACCEPTANCE.md
```

The next document should define Git worktree lifecycle, repository identity validation, write ownership, dirty-worktree protection, cleanup, cancellation safety, retention, and path containment.
