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

        # Resolved once, before the checks run: every check in this pass is at
        # least as recent as this revision, so Evidence carries the revision it
        # was actually established against rather than only the worktree's base.
        verified_revision = self._current_revision(workspace)

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
                verified_revision=verified_revision,
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
        verified_revision: str | None = None,
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

        # A verification command is a blocking child process. Running it off the
        # event loop keeps the API responsive for the whole bounded timeout.
        outcome = await asyncio.to_thread(
            self._commands.run,
            definition,
            working_directory=working_directory,
        )

        evidence = self._record_evidence(
            run,
            workspace,
            definition,
            outcome,
            agent_run=agent_run,
            verified_revision=verified_revision,
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
        agent_run: AgentRun | None = None,
    ) -> Evidence:
        """Append DIFF_SUMMARY evidence describing a worktree's change set.

        Derived from Git, and never from what an executor claims it wrote.
        """

        metadata: SafeMetadata = (
            (FILES_CHANGED_KEY, str(files_changed)),
            (BASE_REVISION_KEY, base_revision),
        )

        if current_revision is not None:
            metadata = metadata + ((CURRENT_REVISION_KEY, current_revision),)

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
        """Return the Run's Workspace that verification may execute inside.

        The Workspace is derived from durable state only, never from a request
        payload, and it is never the Project's main working tree.
        """

        candidates = [
            workspace
            for workspace in self._workspaces.list_for_run(run.id)
            if workspace.writable and workspace.status in _VERIFIABLE_WORKSPACE_STATUSES
        ]

        if not candidates:
            raise VerificationWorkspaceError(
                CommandRejectionCode.WORKSPACE_UNAVAILABLE,
                "No verified writable Workspace is available for verification; "
                "verification never runs against the Project's main working tree.",
            )

        # Deterministic: the most recently allocated Workspace.
        return max(candidates, key=lambda workspace: (workspace.created_at, str(workspace.id)))

    def _current_revision(self, workspace: Workspace) -> str | None:
        """Return the Worktree's current revision, or None when it cannot be read.

        An unread revision is reported as absent rather than guessed: Evidence that
        names no revision is weaker than Evidence that names a wrong one.
        """

        try:
            summary = self._workspaces.capture_changes(workspace.id)
        except Exception:  # noqa: BLE001 - a missing revision must not block a check
            return None

        return summary.current_revision

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
