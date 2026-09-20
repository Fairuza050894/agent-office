"""Verification coordination: bounded command execution and Evidence creation.

This service is the only component that may create command/test Evidence.
Nothing else — not an executor, not an agent run, not a route handler — can
assert that a command passed.

The truth rules it enforces:

* an executor claiming tests passed is not Evidence;
* a command that started is not a command that finished;
* a timeout is not a test failure;
* a spawn failure is not a test failure;
* an unknown result stays unknown and never becomes zero;
* Evidence is never mutated to represent a rerun — a rerun appends.
"""

from __future__ import annotations

import asyncio
from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

from agent_office.application.audit import AuditService
from agent_office.application.events import EventService
from agent_office.application.runs.service import RunService
from agent_office.application.verification.errors import (
    CommandRejectedError,
    VerificationWorkspaceError,
    evidence_not_found,
)
from agent_office.application.verification.ports import CommandExecutor, EvidenceRepository
from agent_office.application.workflows.service import WorkflowService
from agent_office.application.workspaces.ports import WorktreeManager
from agent_office.application.workspaces.service import WorkspaceService
from agent_office.domain import (
    BASE_REVISION_KEY,
    CANDIDATE_STATE_FINGERPRINT_KEY,
    CHECK_KEY_KEY,
    CHECK_TYPE_KEY,
    CURRENT_REVISION_KEY,
    FILES_CHANGED_KEY,
    MAX_OUTPUT_EXCERPT_LENGTH,
    OUTPUT_EXCERPT_KEY,
    WORKSPACE_ID_KEY,
    AgentRun,
    AuditAction,
    AuditActorType,
    AuditTargetType,
    CommandOutcome,
    CommandRejectionCode,
    CommandStatus,
    EventSource,
    EventType,
    Evidence,
    EvidenceId,
    EvidenceKind,
    EvidenceStatus,
    Run,
    RunId,
    SafeMetadata,
    TestResult,
    VerificationCheckDefinition,
    Workspace,
    WorkspaceChangeSummary,
    WorkspaceStatus,
    classify_command,
    utc_now,
)

Clock = Callable[[], datetime]

EvidenceIdFactory = Callable[[], EvidenceId]

#: Workspace states in which a verification command may run.
_VERIFIABLE_WORKSPACE_STATUSES: frozenset[WorkspaceStatus] = frozenset(
    {WorkspaceStatus.READY, WorkspaceStatus.IN_USE}
)


@dataclass(frozen=True, slots=True)
class CheckOutcome:
    """One verification check's factual result and the Evidence it produced."""

    check_key: str
    status: CommandStatus
    evidence: Evidence


class VerificationService:
    """Execute bounded verification checks and record their Evidence."""

    def __init__(
        self,
        evidence_repository: EvidenceRepository,
        command_executor: CommandExecutor,
        worktree_manager: WorktreeManager,
        *,
        run_service: RunService,
        workflow_service: WorkflowService,
        workspace_service: WorkspaceService,
        event_service: EventService,
        audit_service: AuditService,
        clock: Clock = utc_now,
        evidence_id_factory: EvidenceIdFactory = EvidenceId.new,
    ) -> None:
        self._evidence = evidence_repository
        self._commands = command_executor
        self._worktrees = worktree_manager
        self._runs = run_service
        self._workflows = workflow_service
        self._workspaces = workspace_service
        self._events = event_service
        self._audit = audit_service
        self._clock = clock
        self._evidence_id_factory = evidence_id_factory

    # ------------------------------------------------------------------
    # Queries
    # ------------------------------------------------------------------

    def get(self, evidence_id: EvidenceId) -> Evidence:
        """Return Evidence by ID."""

        evidence = self._evidence.get(evidence_id)

        if evidence is None:
            raise evidence_not_found(evidence_id)

        return evidence

    def list_for_run(self, run_id: RunId) -> tuple[Evidence, ...]:
        """Return every Evidence record of a Run."""

        self._runs.get_run(run_id)

        return self._evidence.list_by_run(run_id)

    def required_checks(self, run_id: RunId) -> tuple[VerificationCheckDefinition, ...]:
        """Return the required verification checks frozen into the Run's snapshot.

        A Run whose snapshot declares no checks has no Phase-4 verification
        obligation, so historical orchestration-only Runs are never retroactively
        invalidated.
        """

        snapshot = self._workflows.find_snapshot(run_id)

        if snapshot is None:
            return ()

        return tuple(check for check in snapshot.graph.verification_checks if check.required)

    def latest_check_evidence(self, run_id: RunId) -> dict[str, Evidence]:
        """Return the most recent decisive Evidence per check key.

        Only check-bearing Evidence participates. Where a check was rerun, the
        later observation is the current one; earlier records remain in history.
        """

        latest: dict[str, Evidence] = {}

        # Iteration is in durable order, so a later observation of the same check
        # always supersedes an earlier one. An inconclusive later run therefore
        # cannot be shadowed by a stale earlier pass.
        for evidence in self._evidence.list_by_run(run_id):
            key = dict(evidence.metadata).get(CHECK_KEY_KEY)

            if key:
                latest[key] = evidence

        return latest

    def evidence_satisfies_current_candidate(
        self,
        run_id: RunId,
        evidence: Evidence,
    ) -> bool:
        """Return whether Evidence is a fresh successful observation of the candidate.

        Freshness is evaluated, never persisted by mutating Evidence. Historical
        records stay append-only: a later candidate edit merely means the old
        fingerprint no longer matches the current Git-derived state.
        """

        if not evidence.is_successful_command_evidence:
            return False

        run = self._runs.get_run(run_id)
        candidate_id = run.candidate_workspace_id

        if candidate_id is None:
            return False

        metadata = dict(evidence.metadata)

        if metadata.get(WORKSPACE_ID_KEY) != str(candidate_id):
            return False

        recorded_fingerprint = metadata.get(CANDIDATE_STATE_FINGERPRINT_KEY)

        if recorded_fingerprint is None:
            return False

        try:
            workspace = self._workspaces.get(candidate_id)
        except Exception:  # noqa: BLE001 - unavailable candidate fails closed
            return False

        if workspace.status not in _VERIFIABLE_WORKSPACE_STATUSES:
            return False

        current = self._candidate_state_or_none(workspace)

        return (
            current is not None
            and current.state_fingerprint is not None
            and current.state_fingerprint == recorded_fingerprint
        )

    # ------------------------------------------------------------------
    # Execution
    # ------------------------------------------------------------------

    async def run_required_checks(
        self,
        run: Run,
        *,
        agent_run: AgentRun | None = None,
    ) -> tuple[CheckOutcome, ...]:
        """Execute every required check for a Run and record its Evidence.

        Checks run in declaration order. Nothing is executed unless the command
        policy positively allows it and a verified Workspace hosts it.
        """

        definitions = self.required_checks(run.id)

        if not definitions:
            return ()

        workspace = self._verification_workspace(run)

        outcomes: list[CheckOutcome] = []

        for definition in definitions:
            self._events.emit(
                run,
                EventType.VERIFICATION_CHECK_STARTED,
                source=EventSource.TEST,
                agent_run_id=None if agent_run is None else agent_run.id,
                payload=(
                    ("check_key", definition.key),
                    ("check_type", definition.check_type.value),
                    ("workspace_id", str(workspace.id)),
                ),
            )

            outcome = await self._execute(
                run,
                workspace,
                definition,
                agent_run=agent_run,
            )
            outcomes.append(outcome)

        return tuple(outcomes)

    async def _execute(
        self,
        run: Run,
        workspace: Workspace,
        definition: VerificationCheckDefinition,
        *,
        agent_run: AgentRun | None,
    ) -> CheckOutcome:
        decision = classify_command(definition)

        if not decision.allowed:
            self._audit.record(
                project_id=run.project_id,
                run_id=run.id,
                action=AuditAction.VERIFICATION_COMMAND_DENIED,
                actor_type=AuditActorType.SYSTEM,
                target_type=AuditTargetType.RUN,
                target_id=str(run.id),
                safe_metadata=(
                    ("check_key", definition.key),
                    ("classification", decision.classification.value),
                ),
            )

            raise CommandRejectedError(
                CommandRejectionCode.CLASSIFICATION_NOT_ALLOWED,
                f"Verification check {definition.key} was refused by command policy "
                f"({decision.classification.value}).",
            )

        working_directory = self._resolve_working_directory(workspace)
        before = self._candidate_state(workspace)

        # A verification command is a blocking child process. Running it off the
        # event loop keeps the API responsive for the whole bounded timeout.
        outcome = await asyncio.to_thread(
            self._commands.run,
            definition,
            working_directory=working_directory,
        )

        # Verification evidence is fresh only when the candidate state remained
        # identical for the whole command. If post-command capture fails or the
        # digest changes, the factual command result is still recorded but no
        # freshness fingerprint is attached, so it cannot satisfy a gate.
        after = self._candidate_state_or_none(workspace)
        stable_fingerprint = (
            before.state_fingerprint
            if after is not None
            and before.state_fingerprint is not None
            and before.state_fingerprint == after.state_fingerprint
            else None
        )
        verified_revision = before.current_revision if after is None else after.current_revision

        evidence = self._record_evidence(
            run,
            workspace,
            definition,
            outcome,
            agent_run=agent_run,
            verified_revision=verified_revision,
            candidate_state_fingerprint=stable_fingerprint,
        )

        self._events.emit(
            run,
            EventType.VERIFICATION_CHECK_COMPLETED,
            source=EventSource.TEST,
            agent_run_id=None if agent_run is None else agent_run.id,
            payload=(
                ("check_key", definition.key),
                ("check_type", definition.check_type.value),
                ("status", outcome.status.value),
                ("evidence_id", str(evidence.id)),
            ),
        )

        self._events.emit(
            run,
            EventType.EVIDENCE_CREATED,
            source=EventSource.TEST,
            agent_run_id=None if agent_run is None else agent_run.id,
            payload=(
                ("evidence_id", str(evidence.id)),
                ("kind", evidence.kind.value),
                ("status", evidence.status.value),
                ("check_key", definition.key),
            ),
        )

        return CheckOutcome(
            check_key=definition.key,
            status=outcome.status,
            evidence=evidence,
        )

    # ------------------------------------------------------------------
    # Evidence
    # ------------------------------------------------------------------

    def _record_evidence(
        self,
        run: Run,
        workspace: Workspace,
        definition: VerificationCheckDefinition,
        outcome: CommandOutcome,
        *,
        agent_run: AgentRun | None,
        verified_revision: str | None = None,
        candidate_state_fingerprint: str | None = None,
    ) -> Evidence:
        """Append the Evidence for one command execution.

        The record identifies the Workspace, the revision the Worktree was created
        from, and the revision the command was actually run against. Those three
        facts are what a later staleness decision needs; nothing here decides
        staleness, and the completion gate does not yet compare them.
        """

        result = TestResult(
            command_status=outcome.status,
            exit_code=outcome.exit_code,
            duration_ms=outcome.duration_ms,
            timed_out=outcome.status is CommandStatus.TIMED_OUT,
            output_truncated=outcome.output_truncated,
        )

        metadata: SafeMetadata = (
            (CHECK_KEY_KEY, definition.key),
            (CHECK_TYPE_KEY, definition.check_type.value),
        ) + result.to_metadata()

        if workspace.id is not None:
            metadata = metadata + ((WORKSPACE_ID_KEY, str(workspace.id)),)

        excerpt = _output_excerpt(outcome)

        if excerpt:
            metadata = metadata + ((OUTPUT_EXCERPT_KEY, excerpt),)

        if workspace.base_revision is not None:
            metadata = metadata + ((BASE_REVISION_KEY, workspace.base_revision),)

        if verified_revision is not None:
            metadata = metadata + ((CURRENT_REVISION_KEY, verified_revision),)

        if candidate_state_fingerprint is not None:
            metadata = metadata + ((CANDIDATE_STATE_FINGERPRINT_KEY, candidate_state_fingerprint),)

        summary = self._summarize(definition, outcome)

        evidence = Evidence(
            id=self._evidence_id_factory(),
            project_id=run.project_id,
            task_id=run.task_id,
            run_id=run.id,
            agent_run_id=None if agent_run is None else agent_run.id,
            kind=definition.evidence_kind,
            status=EvidenceStatus.AVAILABLE,
            summary=summary,
            metadata=metadata,
            created_at=utc_now(self._clock),
        )

        self._evidence.append(evidence)
        return evidence

    @staticmethod
    def _summarize(definition: VerificationCheckDefinition, outcome: CommandOutcome) -> str:
        """Return a bounded, factual summary. Never a quality claim."""

        prefix = f"{definition.check_type.value} check {definition.key}: "

        if outcome.status is CommandStatus.PASSED:
            return f"{prefix}the command exited 0."

        if outcome.status is CommandStatus.FAILED:
            return f"{prefix}the command exited {outcome.exit_code}."

        if outcome.status is CommandStatus.TIMED_OUT:
            return f"{prefix}the command exceeded its {definition.timeout_seconds}s timeout."

        return f"{prefix}the command could not be started."

    def record_workspace_status_evidence(
        self,
        run: Run,
        workspace: Workspace,
        *,
        files_changed: int,
        base_revision: str,
        current_revision: str | None,
        candidate_state_fingerprint: str | None = None,
        agent_run: AgentRun | None = None,
    ) -> Evidence:
        """Append DIFF_SUMMARY evidence describing a worktree's change set.

        Derived from Git, and never from what an executor claims it wrote.
        """

        metadata: SafeMetadata = (
            (FILES_CHANGED_KEY, str(files_changed)),
            (BASE_REVISION_KEY, base_revision),
        )

        if workspace.id is not None:
            metadata = metadata + ((WORKSPACE_ID_KEY, str(workspace.id)),)

        if current_revision is not None:
            metadata = metadata + ((CURRENT_REVISION_KEY, current_revision),)

        if candidate_state_fingerprint is not None:
            metadata = metadata + ((CANDIDATE_STATE_FINGERPRINT_KEY, candidate_state_fingerprint),)

        evidence = Evidence(
            id=self._evidence_id_factory(),
            project_id=run.project_id,
            task_id=run.task_id,
            run_id=run.id,
            agent_run_id=None if agent_run is None else agent_run.id,
            kind=EvidenceKind.DIFF_SUMMARY,
            status=EvidenceStatus.AVAILABLE,
            summary=f"The worktree recorded {files_changed} changed file(s) against its base.",
            metadata=metadata,
            created_at=utc_now(self._clock),
        )

        self._evidence.append(evidence)

        self._events.emit(
            run,
            EventType.EVIDENCE_CREATED,
            source=EventSource.WORKSPACE,
            agent_run_id=None if agent_run is None else agent_run.id,
            payload=(
                ("evidence_id", str(evidence.id)),
                ("kind", evidence.kind.value),
                ("status", evidence.status.value),
            ),
        )

        return evidence

    # ------------------------------------------------------------------
    # Workspace binding
    # ------------------------------------------------------------------

    def _verification_workspace(self, run: Run) -> Workspace:
        """Return the Run's explicitly designated candidate Workspace.

        Verification never guesses from allocation order. The candidate identity
        is backend-authoritative durable Run state and can only name a writable
        Workspace belonging to this Run.
        """

        current_run = self._runs.get_run(run.id)
        candidate_id = current_run.candidate_workspace_id

        if candidate_id is None:
            raise VerificationWorkspaceError(
                CommandRejectionCode.WORKSPACE_UNAVAILABLE,
                "The Run has no explicit candidate Workspace; verification scope is "
                "ambiguous and will not fall back to another worktree or the main tree.",
            )

        try:
            candidate = self._workspaces.get(candidate_id)
        except Exception as exc:
            raise VerificationWorkspaceError(
                CommandRejectionCode.WORKSPACE_UNAVAILABLE,
                "The Run's designated candidate Workspace is unavailable.",
            ) from exc

        if (
            candidate.run_id != run.id
            or not candidate.writable
            or candidate.status not in _VERIFIABLE_WORKSPACE_STATUSES
        ):
            raise VerificationWorkspaceError(
                CommandRejectionCode.WORKSPACE_NOT_VERIFIABLE,
                "The Run's designated candidate Workspace is not verifiable.",
            )

        return candidate

    def _candidate_state(self, workspace: Workspace) -> WorkspaceChangeSummary:
        """Capture a fingerprintable Git state or refuse verification."""

        try:
            summary = self._workspaces.capture_changes(workspace.id)
        except Exception as exc:
            raise VerificationWorkspaceError(
                CommandRejectionCode.WORKSPACE_NOT_VERIFIABLE,
                "The candidate Workspace state could not be fingerprinted safely.",
            ) from exc

        if summary.state_fingerprint is None:
            raise VerificationWorkspaceError(
                CommandRejectionCode.WORKSPACE_NOT_VERIFIABLE,
                "The candidate Workspace state has no trustworthy fingerprint.",
            )

        return summary

    def _candidate_state_or_none(
        self,
        workspace: Workspace,
    ) -> WorkspaceChangeSummary | None:
        try:
            return self._candidate_state(workspace)
        except VerificationWorkspaceError:
            return None

    def _resolve_working_directory(self, workspace: Workspace) -> Path:
        """Resolve the contained absolute location from opaque Workspace identity."""

        try:
            location = self._worktrees.resolve_workspace_path(workspace.path_ref)
        except Exception as exc:  # noqa: BLE001 - any resolution failure is unsafe
            raise VerificationWorkspaceError(
                CommandRejectionCode.WORKSPACE_NOT_VERIFIABLE,
                "The Workspace location could not be resolved safely.",
            ) from exc

        if not location.exists():
            raise VerificationWorkspaceError(
                CommandRejectionCode.WORKSPACE_NOT_VERIFIABLE,
                "The Workspace location no longer exists.",
            )

        return location


def _output_excerpt(outcome: CommandOutcome) -> str:
    """Return a bounded, already-redacted excerpt of the command's output.

    Stderr is preferred because it is where a failing check explains itself. Raw
    output is never persisted: only this bounded excerpt is, and it has already
    had secrets and host paths removed by the command runner.
    """

    text = (outcome.stderr or outcome.stdout).strip()

    if not text:
        return ""

    if len(text) <= MAX_OUTPUT_EXCERPT_LENGTH:
        return text

    return text[:MAX_OUTPUT_EXCERPT_LENGTH] + "...<truncated>"
