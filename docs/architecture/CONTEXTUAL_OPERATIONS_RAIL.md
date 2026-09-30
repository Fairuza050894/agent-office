# Contextual Operations Rail

Status: Phase 10F implementation contract

## Purpose

The Contextual Operations Rail makes Agent Office an interactive operational
workspace without turning the 3D Office into decorative chrome or inventing
agent conversations.

The rail is shared presentation infrastructure across Workspace, Live, and
Replay. It has four views:

```text
Discussion | Details | Files | Logs
```

It is collapsible and Office-local. It is not global application navigation and
it is not a workflow authority.

## Truth-source matrix

| Scope | Discussion | Details | Files | Logs |
| --- | --- | --- | --- | --- |
| Workspace | ComposerThread / ComposerMessage | Project, planning state, Task, latest Run | PlanningArtifact records | PlanningEvent |
| Live | canonical Event projection | Run, AgentRun, Executor, Workspace, Finding, Evidence | WorkspaceChangeSummary + Evidence metadata | Event + AuditRecord |
| Replay | historical Event projection at replay cutoff | historical Run projection plus durable metadata | factual persisted metadata only | historical Event projection + durable AuditRecord metadata |

Ambient OfficePresenceMember data may explain who is visually present, but it
must never be presented as an executing AgentRun.

## Discussion

### Workspace

The existing Universal Composer lives inside the Discussion tab. No second
planning implementation exists.

User messages continue through existing Composer APIs:

```text
user message
  -> ComposerMessage
  -> deterministic preparation
  -> TeamProposal / PlanningArtifact / RequirementCandidate
```

Role contributions may only be shown when persisted by the backend. The UI must
not synthesize role dialogue for visual effect.

### Live / Replay

The rail renders canonical Events in a conversational reading format. This is
not a writable chat channel to an in-flight executor.

A follow-up request creates a new Task. It does not mutate the active AgentRun,
retry it, inject instructions into it, or imply execution.

## Task creation

Manual task creation from the rail calls the existing Task API.

Approved RequirementCandidates can be converted into a Task proposal
deterministically. The resulting Task is visible in the Operations Dock.

```text
Discussion / approved requirements
  -> Task
  -X-> Run
```

Run creation/execution remains governed by the existing planning-to-execution
promotion boundary.

## Details

Details is a compact factual inspector. Selection in the 3D scene or Operations
Dock changes the same rail context.

The rail may show identifiers and safe metadata already exposed by the HTTP API,
but must not expose repository filesystem paths that are intentionally excluded
from public DTOs.

## Files

Phase 10F distinguishes three concepts:

1. PlanningArtifact: structured planning record, not a filesystem file.
2. WorkspaceChangeSummary: safe relative changed-path metadata.
3. Evidence: persisted evidence metadata.

The current backend does not expose a bounded generic Artifact-content API.
Therefore Phase 10F deliberately does not add fake Preview or Download controls.

A future content API must define:

- Project / Run / Artifact ownership
- root containment
- no arbitrary absolute-path input
- symlink escape prevention
- bounded file size
- allowlisted preview media types
- safe Content-Disposition for downloads
- redaction / secret policy
- immutable evidence linkage where applicable

## Logs

Workspace Logs use PlanningEvent.

Live / Replay Logs use canonical Event and AuditRecord data. Raw provider
payloads are not exposed.

Replay must continue to respect the replay Event cutoff for activity displayed
as historical operational truth.

## GitHub boundary

The current Project registry accepts a validated local Git repository path.
Phase 10F does not pretend that GitHub is connected merely because a repository
has a remote.

GitHub discovery/import requires a separate provider contract covering:

- provider-native authentication without storing plaintext PATs in domain state
- repository discovery
- explicit user selection
- clone destination ownership
- duplicate/canonical-repository detection
- private repository access
- bounded clone/network behavior
- local Project registration after successful clone/inspection

Until that contract exists, local Project registration remains authoritative.

## Non-regression invariants

- no auto merge
- no force push
- no fake AgentRun
- no fake agent dialogue
- no fake files
- no arbitrary filesystem reads
- no Live / Replay movement change
- replay forward-facing correction remains intact
- Office renderer failure must not affect operational controls
