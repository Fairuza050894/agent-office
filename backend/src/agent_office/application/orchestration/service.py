"""Deterministic Run orchestration.

The orchestrator owns eligibility evaluation, dependency resolution, fan-out
scheduling, fan-in completion, stage and Run state, cancellation coordination,
and completion gates. It never executes provider APIs directly: every execution
goes through the Executor port, which keeps the core provider-neutral.

Phase 3A executes through the deterministic ReferenceExecutor only. No real AI
runtime is reachable from this module.
"""

from __future__ import annotations

import asyncio
from collections.abc import Callable, Sequence
from datetime import datetime

from agent_office.application.agents.service import AgentRunService
from agent_office.application.events.errors import EventScopeError
from agent_office.application.events.ports import EventProcessingResult
from agent_office.application.events.service import EventService
from agent_office.application.projects.service import ProjectService
from agent_office.application.runs.errors import (
    ProjectArchivedError,
    RunNotStartableError,
    WorkflowResolutionError,
)
from agent_office.application.runs.service import RunService
from agent_office.application.runs.stages import RunStageService
from agent_office.application.tasks.service import TaskService
from agent_office.application.workflows.service import WorkflowService
from agent_office.domain import (
    AgentAccessMode,
    AgentRun,
    AgentRunReasonCode,
    AgentRunStatus,
    CancellationOutcome,
    CapabilityReport,
    CapabilitySupport,
    ChangeArea,
    ConditionOutcome,
    Event,
    EventSource,
    EventType,
    ExecutionOutcome,
    ExecutionStatus,
    ExecutorCapability,
    FrozenAgentAssignment,
    ProjectStatus,
    Run,
    RunId,
    RunReasonCode,
    RunStageState,
    RunStageStatus,
    RunStatus,
    StageExecutionMode,
    StageKey,
    StageReasonCode,
    StartExecutionOutcome,
    StartExecutionRequest,
    WorkflowDefinitionStatus,
    WorkflowSnapshot,
    evaluate_stage_condition,
    is_terminal_agent_run_status,
    is_terminal_run_stage_status,
    is_terminal_run_status,
    run_transition_allowed,
    utc_now,
)
from agent_office.infrastructure.executors.registry import ExecutorRegistry, RegisteredExecutor

Clock = Callable[[], datetime]

MAX_ORCHESTRATION_STEPS = 200

MAX_INSTRUCTION_LENGTH = 4000

_STAGE_RUN_PHASE: dict[StageKey, RunStatus] = {
    StageKey.DISCOVERY: RunStatus.PLANNING,
    StageKey.PLANNING: RunStatus.PLANNING,
    StageKey.IMPLEMENTATION: RunStatus.RUNNING,
    StageKey.INTEGRATION: RunStatus.RUNNING,
    StageKey.REVIEW: RunStatus.REVIEWING,
    StageKey.REMEDIATION: RunStatus.REMEDIATING,
    StageKey.VERIFICATION: RunStatus.VERIFYING,
    StageKey.DOCUMENTATION: RunStatus.RUNNING,
    StageKey.FINALIZATION: RunStatus.RUNNING,
}

_PHASE_EVENTS: dict[RunStatus, EventType] = {
    RunStatus.REVIEWING: EventType.RUN_REVIEWING,
    RunStatus.REMEDIATING: EventType.RUN_REMEDIATING,
    RunStatus.VERIFYING: EventType.RUN_VERIFYING,
}

# Canonical event-to-state mapping for inbound Executor-scoped events.
_AGENT_EVENT_STATUS: dict[EventType, AgentRunStatus] = {
    EventType.AGENT_STARTED: AgentRunStatus.RUNNING,
    EventType.AGENT_WAITING: AgentRunStatus.WAITING,
    EventType.AGENT_COMPLETED: AgentRunStatus.COMPLETED,
    EventType.AGENT_FAILED: AgentRunStatus.FAILED,
    EventType.AGENT_BLOCKED: AgentRunStatus.BLOCKED,
    EventType.AGENT_CANCELLED: AgentRunStatus.CANCELLED,
}

# Canonical stage events emitted for each reconciled stage status.
_STAGE_EVENTS: dict[RunStageStatus, EventType] = {
    RunStageStatus.WAITING: EventType.STAGE_WAITING,
    RunStageStatus.COMPLETED: EventType.STAGE_COMPLETED,
    RunStageStatus.FAILED: EventType.STAGE_FAILED,
    RunStageStatus.BLOCKED: EventType.STAGE_BLOCKED,
    RunStageStatus.CANCELLED: EventType.STAGE_CANCELLED,
}

# Capabilities the Phase 3A orchestrator depends on for every assignment.
# START_EXECUTION is required to start an assignment at all and STATUS_QUERY is
# required to observe its outcome; without either, the orchestrator could not
# report truthful state.
REQUIRED_EXECUTOR_CAPABILITIES: tuple[ExecutorCapability, ...] = (
    ExecutorCapability.START_EXECUTION,
    ExecutorCapability.STATUS_QUERY,
)


def capability_gap(report: CapabilityReport) -> tuple[ExecutorCapability, ...]:
    """Return required capabilities the Executor does not explicitly support.

    A capability reported as UNKNOWN is not treated as SUPPORTED: the
    orchestrator must not pretend an unproven requirement is satisfied.
    """

    return tuple(
        capability
        for capability in REQUIRED_EXECUTOR_CAPABILITIES
        if report.support_for(capability) is not CapabilitySupport.SUPPORTED
    )


def _should_execute_concurrently(
    mode: StageExecutionMode,
    assignments: Sequence[FrozenAgentAssignment],
) -> bool:
    """Return whether a stage's assignments may genuinely overlap.

    Concurrency is limited to a stage that declares ``PARALLEL_ALLOWED`` and
    whose every assignment is read-only. Without workspace isolation,
    write-capable assignments must stay sequential.
    """

    if mode is not StageExecutionMode.PARALLEL_ALLOWED:
        return False

    return bool(assignments) and all(
        assignment.access_mode is AgentAccessMode.READ_ONLY for assignment in assignments
    )


class RunOrchestrator:
    """Coordinates workflow execution for a Run."""

    def __init__(
        self,
        *,
        run_service: RunService,
        task_service: TaskService,
        project_service: ProjectService,
        workflow_service: WorkflowService,
        stage_service: RunStageService,
        agent_run_service: AgentRunService,
        event_service: EventService,
        executor_registry: ExecutorRegistry,
        clock: Clock = utc_now,
    ) -> None:
        self._runs = run_service
        self._tasks = task_service
        self._projects = project_service
        self._workflows = workflow_service
        self._stages = stage_service
        self._agent_runs = agent_run_service
        self._events = event_service
        self._executors = executor_registry
        self._clock = clock

    # ------------------------------------------------------------------
    # Query helpers
    # ------------------------------------------------------------------

    def list_stages(self, run_id: RunId) -> tuple[RunStageState, ...]:
        """Return the durable stage state of a Run."""

        return self._stages.list_for_run(run_id)

    def list_agent_runs(self, run_id: RunId) -> tuple[AgentRun, ...]:
        """Return every AgentRun of a Run."""

        return self._agent_runs.list_for_run(run_id)

    def get_snapshot(self, run_id: RunId) -> WorkflowSnapshot:
        """Return the frozen WorkflowSnapshot of a Run."""

        return self._workflows.get_snapshot(run_id)

    # ------------------------------------------------------------------
    # Start
    # ------------------------------------------------------------------

    async def start_run(
        self,
        run_id: RunId,
        *,
        changed_areas: tuple[ChangeArea, ...] | None = None,
    ) -> Run:
        """Plan and execute a Run through the resolved Executor.

        The workflow is frozen before anything executes, so a later edit to the
        reusable WorkflowDefinition cannot alter this Run.
        """

        run = self._runs.get_run(run_id)
        task = self._tasks.get_task(run.task_id)
        project = self._projects.get_project(run.project_id)

        if project.status is ProjectStatus.ARCHIVED:
            raise ProjectArchivedError(
                f"Project {project.id} is archived and cannot start new Runs"
            )

        if run.status is not RunStatus.CREATED:
            raise RunNotStartableError(f"Run {run.id} cannot be started from status {run.status}")

        definition = self._workflows.resolve_definition(
            requested_workflow_id=task.requested_workflow_id,
            project_default_workflow_id=project.default_workflow_id,
        )

        if definition.status is not WorkflowDefinitionStatus.ACTIVE:
            raise WorkflowResolutionError(
                f"Workflow {definition.key} is not active and cannot be executed"
            )

        registered = self._executors.resolve(
            requested_executor_id=run.requested_executor_id,
            project_preferred_executor_id=project.preferred_executor_id,
        )

        if registered is None:
            return self._block(
                run,
                RunReasonCode.EXECUTOR_UNAVAILABLE,
                "No registered Executor could be resolved for this Run.",
            )

        snapshot = self._workflows.freeze_snapshot(
            run_id=run.id,
            project_id=run.project_id,
            definition=definition,
        )

        run = self._runs.attach_execution(
            run,
            snapshot_id=snapshot.id,
            resolved_executor_id=registered.id,
            changed_areas=changed_areas,
        )

        self._events.emit(
            run,
            EventType.WORKFLOW_SNAPSHOT_CREATED,
            source=EventSource.ORCHESTRATOR,
            payload=(
                ("workflow_snapshot_id", str(snapshot.id)),
                ("source_workflow_key", snapshot.source_workflow_key),
                ("source_workflow_version", snapshot.source_workflow_version),
            ),
        )

        run = self._runs.transition(run, RunStatus.PLANNING)
        self._events.emit(
            run,
            EventType.RUN_PLANNING_STARTED,
            source=EventSource.ORCHESTRATOR,
            payload=(("stage_count", len(snapshot.graph.stages)),),
        )

        self._initialize_stages(run, snapshot)

        run = self._runs.transition(run, RunStatus.READY)
        self._events.emit(run, EventType.RUN_READY, source=EventSource.ORCHESTRATOR)
        self._events.emit(run, EventType.RUN_STARTED, source=EventSource.ORCHESTRATOR)

        return await self._advance(run)

    def _initialize_stages(self, run: Run, snapshot: WorkflowSnapshot) -> None:
        """Persist every stage of the frozen workflow in PENDING state."""

        now = utc_now(self._clock)

        stages = tuple(
            RunStageState(
                run_id=run.id,
                project_id=run.project_id,
                stage_key=stage.key,
                status=RunStageStatus.PENDING,
                required=stage.required,
                order_hint=stage.order_hint,
                execution_mode=stage.execution_mode,
                condition=stage.condition,
                created_at=now,
                updated_at=now,
            )
            for stage in snapshot.graph.ordered_stages()
        )

        self._stages.add_many(stages)

    # ------------------------------------------------------------------
    # Advancement loop
    # ------------------------------------------------------------------

    async def _advance(self, run: Run) -> Run:
        """Advance the workflow deterministically until it cannot progress.

        The loop stops as soon as one iteration produces no durable state
        change, which is how a genuinely waiting or still-running workflow is
        distinguished from an actionable one.
        """

        previous: tuple[object, ...] | None = None

        for _ in range(MAX_ORCHESTRATION_STEPS):
            stages = self._stages.list_for_run(run.id)

            if not stages:
                return run

            if all(is_terminal_run_stage_status(stage.status) for stage in stages):
                return self._finalize(run, stages)

            signature: tuple[object, ...] = (
                run.status,
                tuple((stage.stage_key, stage.status) for stage in stages),
            )

            if signature == previous:
                # No durable progress was produced by the previous iteration.
                return run

            previous = signature

            run = await self._advance_once(run, stages)

            if run.status is RunStatus.BLOCKED or is_terminal_run_status(run.status):
                return run

        return self._block(
            run,
            RunReasonCode.ORCHESTRATION_STEP_LIMIT,
            "Orchestration stopped after the bounded step limit was reached.",
        )

    async def _advance_once(self, run: Run, stages: tuple[RunStageState, ...]) -> Run:
        ready = [stage for stage in stages if stage.status is RunStageStatus.READY]

        if ready:
            stage = min(ready, key=lambda item: (item.order_hint, item.stage_key.value))
            return await self._execute_stage(run, stage)

        pending = sorted(
            (stage for stage in stages if stage.status is RunStageStatus.PENDING),
            key=lambda item: (item.order_hint, item.stage_key.value),
        )

        for stage in pending:
            outcome = evaluate_stage_condition(stage.condition, run.changed_areas)

            if outcome is ConditionOutcome.FALSE:
                self._stages.transition(
                    stage,
                    RunStageStatus.SKIPPED,
                    reason_code=StageReasonCode.CONDITION_FALSE,
                    reason_summary=(
                        f"Condition {stage.condition.value} evaluated to FALSE for this Run."
                    ),
                )
                self._events.emit(
                    run,
                    EventType.STAGE_SKIPPED,
                    source=EventSource.ORCHESTRATOR,
                    payload=(
                        ("stage_key", stage.stage_key.value),
                        ("reason_code", StageReasonCode.CONDITION_FALSE.value),
                        ("condition", stage.condition.value),
                    ),
                )
                return run

            if outcome is ConditionOutcome.UNKNOWN:
                self._stages.transition(
                    stage,
                    RunStageStatus.BLOCKED,
                    reason_code=StageReasonCode.CONDITION_UNKNOWN,
                    reason_summary=(
                        f"Condition {stage.condition.value} could not be evaluated from "
                        "factual Run input."
                    ),
                )
                self._events.emit(
                    run,
                    EventType.STAGE_BLOCKED,
                    source=EventSource.ORCHESTRATOR,
                    payload=(
                        ("stage_key", stage.stage_key.value),
                        ("reason_code", StageReasonCode.CONDITION_UNKNOWN.value),
                        ("condition", stage.condition.value),
                    ),
                )
                return self._block(
                    run,
                    RunReasonCode.CONDITION_UNKNOWN,
                    (
                        f"Stage {stage.stage_key.value} depends on condition "
                        f"{stage.condition.value}, which could not be evaluated."
                    ),
                )

            if self._dependencies_satisfied(stages, stage):
                self._stages.transition(stage, RunStageStatus.READY)
                self._events.emit(
                    run,
                    EventType.STAGE_READY,
                    source=EventSource.ORCHESTRATOR,
                    payload=(("stage_key", stage.stage_key.value),),
                )
                return run

        blocked_stages = [stage for stage in stages if stage.status is RunStageStatus.BLOCKED]

        if blocked_stages:
            stage = blocked_stages[0]
            return self._block(
                run,
                RunReasonCode.UNKNOWN_EXECUTION_STATE,
                stage.reason_summary
                or f"Stage {stage.stage_key.value} cannot progress without intervention.",
            )

        active = [
            stage
            for stage in stages
            if stage.status in {RunStageStatus.RUNNING, RunStageStatus.WAITING}
        ]

        if active:
            # A stage is still executing or waiting; the Run keeps its phase.
            return run

        if pending:
            return self._block(
                run,
                RunReasonCode.DEPENDENCY_NOT_COMPLETE,
                "No remaining workflow stage can be satisfied by its dependencies.",
            )

        return run

    def _dependencies_satisfied(
        self,
        stages: tuple[RunStageState, ...],
        stage: RunStageState,
    ) -> bool:
        """Return whether every predecessor reached an acceptable terminal state.

        A predecessor that was validly skipped by an explicit workflow condition
        does not block its dependents.
        """

        snapshot = self._workflows.find_snapshot(stage.run_id)

        if snapshot is None:
            return False

        definition = snapshot.graph.stage(stage.stage_key)

        if definition is None:
            return False

        by_key = {item.stage_key: item for item in stages}

        for dependency_key in definition.depends_on:
            dependency = by_key.get(dependency_key)

            if dependency is None:
                return False

            if dependency.status not in {RunStageStatus.COMPLETED, RunStageStatus.SKIPPED}:
                return False

        return True

    # ------------------------------------------------------------------
    # Stage execution
    # ------------------------------------------------------------------

    async def _execute_stage(self, run: Run, stage: RunStageState) -> Run:
        snapshot = self._workflows.find_snapshot(run.id)

        if snapshot is None:
            return self._block(
                run,
                RunReasonCode.WORKFLOW_UNAVAILABLE,
                "The Run has no frozen workflow snapshot.",
            )

        definition = snapshot.graph.stage(stage.stage_key)

        if definition is None:
            return self._block(
                run,
                RunReasonCode.WORKFLOW_UNAVAILABLE,
                f"Stage {stage.stage_key.value} is not part of the frozen workflow.",
            )

        registered = self._resolved_executor(run)

        if registered is None:
            return self._block(
                run,
                RunReasonCode.EXECUTOR_UNAVAILABLE,
                "The Executor resolved for this Run is no longer registered.",
            )

        assignments = snapshot.assignments_for(stage.stage_key)

        if not assignments:
            return self._block(
                run,
                RunReasonCode.WORKFLOW_UNAVAILABLE,
                f"Stage {stage.stage_key.value} has no frozen agent assignments.",
            )

        task_title = self._tasks.get_task(run.task_id).title

        stage = self._stages.transition(stage, RunStageStatus.RUNNING)
        self._events.emit(
            run,
            EventType.STAGE_STARTED,
            source=EventSource.ORCHESTRATOR,
            payload=(("stage_key", stage.stage_key.value),),
        )

        run = self._apply_phase(run, stage.stage_key)

        # Capability evaluation happens before any external start side effect.
        capability_report = await registered.adapter.capabilities()

        agent_runs = [
            self._create_agent_run(run, stage, assignment, registered) for assignment in assignments
        ]

        if _should_execute_concurrently(definition.execution_mode, assignments):
            # Read-only assignments hold no workspace and cannot conflict, so
            # they may genuinely overlap. Write-capable assignments stay
            # sequential until workspace isolation exists.
            await asyncio.gather(
                *(
                    self._execute_agent_run(
                        run, agent_run, registered, task_title, capability_report
                    )
                    for agent_run in agent_runs
                )
            )
        else:
            for agent_run in agent_runs:
                await self._execute_agent_run(
                    run, agent_run, registered, task_title, capability_report
                )

        return self._complete_stage(run, stage.stage_key)

    def _create_agent_run(
        self,
        run: Run,
        stage: RunStageState,
        assignment: FrozenAgentAssignment,
        registered: RegisteredExecutor,
    ) -> AgentRun:
        """Create a durable AgentRun from frozen assignment authority.

        The profile identity and version come from the WorkflowSnapshot, never
        from the live AgentProfile catalog, so a later profile revision cannot
        change how an already-started Run is interpreted.
        """

        agent_run = self._agent_runs.create(
            run=run,
            stage_key=stage.stage_key,
            agent_profile_id=assignment.profile_id,
            agent_profile_key=assignment.profile_key,
            agent_profile_version=assignment.profile_version,
            executor_id=registered.id,
            access_mode=assignment.access_mode,
        )

        self._events.emit(
            run,
            EventType.AGENT_CREATED,
            source=EventSource.ORCHESTRATOR,
            agent_run_id=agent_run.id,
            payload=(
                ("agent_profile_key", agent_run.agent_profile_key),
                ("agent_profile_version", agent_run.agent_profile_version),
                ("stage_key", agent_run.stage_key.value),
                ("executor_id", str(agent_run.executor_id)),
                ("access_mode", agent_run.access_mode.value),
                ("required", assignment.required),
            ),
        )

        return agent_run

    async def _execute_agent_run(
        self,
        run: Run,
        agent_run: AgentRun,
        registered: RegisteredExecutor,
        task_title: str,
        capability_report: CapabilityReport,
    ) -> AgentRun:
        """Drive one AgentRun through the Executor port.

        The capability gate is evaluated before any external start side effect,
        durable intent is recorded before the start call, and an UNKNOWN start
        outcome is never retried automatically.
        """

        adapter = registered.adapter

        gap = capability_gap(capability_report)

        if gap:
            return self._block_agent_run(
                run,
                agent_run,
                AgentRunReasonCode.REQUIRED_CAPABILITY_UNSUPPORTED,
                "The resolved Executor does not report support for required "
                f"capabilities: {', '.join(capability.value for capability in gap)}.",
                capability_snapshot=capability_report,
            )

        agent_run = self._agent_runs.transition(agent_run, AgentRunStatus.STARTING)

        self._events.emit(
            run,
            EventType.AGENT_START_REQUESTED,
            source=EventSource.ORCHESTRATOR,
            agent_run_id=agent_run.id,
            payload=(
                ("agent_profile_key", agent_run.agent_profile_key),
                ("agent_profile_version", agent_run.agent_profile_version),
                ("executor_id", str(agent_run.executor_id)),
                ("stage_key", agent_run.stage_key.value),
            ),
        )

        start_result = await adapter.start(
            StartExecutionRequest(
                agent_run_id=agent_run.id,
                instruction=_compose_instruction(agent_run, task_title),
                safe_context=(
                    ("agent_profile_key", agent_run.agent_profile_key),
                    ("stage_key", agent_run.stage_key.value),
                    ("access_mode", agent_run.access_mode.value),
                ),
            )
        )

        if start_result.outcome is StartExecutionOutcome.FAILED:
            return self._fail_agent_run(
                run,
                agent_run,
                AgentRunReasonCode.EXECUTOR_START_FAILED,
                start_result.safe_summary or "The executor failed before the assignment started.",
                retryable=start_result.retryable,
            )

        if start_result.outcome is StartExecutionOutcome.UNKNOWN:
            return self._block_agent_run(
                run,
                agent_run,
                AgentRunReasonCode.EXECUTOR_START_UNKNOWN,
                start_result.safe_summary or "The executor start outcome could not be determined.",
            )

        session = start_result.session_ref

        if session is None:
            return self._fail_agent_run(
                run,
                agent_run,
                AgentRunReasonCode.EXECUTOR_START_FAILED,
                "The executor reported a start without a session reference.",
                retryable=False,
            )

        agent_run = self._agent_runs.transition(
            agent_run,
            AgentRunStatus.RUNNING,
            session_ref=session,
            capability_snapshot=capability_report,
        )

        self._events.emit(
            run,
            EventType.AGENT_STARTED,
            source=EventSource.EXECUTOR,
            agent_run_id=agent_run.id,
            source_ref=session.opaque_session_id,
            executor_id=agent_run.executor_id,
            payload=(("stage_key", agent_run.stage_key.value),),
        )

        status = await adapter.get_status(session)

        if status is ExecutionStatus.WAITING:
            return self._wait_agent_run(
                run,
                agent_run,
                AgentRunReasonCode.EXECUTOR_WAITING,
                "The executor reported that the assignment is waiting.",
            )

        if status is ExecutionStatus.FAILED:
            return self._fail_agent_run(
                run,
                agent_run,
                AgentRunReasonCode.EXECUTION_FAILED,
                "The executor reported a failed assignment.",
                retryable=None,
            )

        if status is ExecutionStatus.CANCELLED:
            return self._cancel_agent_run(
                run,
                agent_run,
                AgentRunReasonCode.CANCELLATION_CONFIRMED,
                "The executor reported the assignment as cancelled.",
            )

        if status is ExecutionStatus.UNKNOWN:
            return self._block_agent_run(
                run,
                agent_run,
                AgentRunReasonCode.EXECUTION_STATUS_UNKNOWN,
                "The executor could not report a trustworthy assignment status.",
            )

        if status is not ExecutionStatus.COMPLETED:
            # PENDING or RUNNING: the assignment is genuinely still active.
            return agent_run

        result = await adapter.fetch_result(session)

        if result.outcome is ExecutionOutcome.SUCCESS:
            completed = self._agent_runs.transition(
                agent_run,
                AgentRunStatus.COMPLETED,
                result_outcome=ExecutionOutcome.SUCCESS,
                result_summary=result.summary,
            )
            self._events.emit(
                run,
                EventType.AGENT_COMPLETED,
                source=EventSource.EXECUTOR,
                agent_run_id=completed.id,
                payload=(("summary", result.summary),),
            )
            return completed

        if result.outcome is ExecutionOutcome.FAILURE:
            return self._fail_agent_run(
                run,
                agent_run,
                AgentRunReasonCode.EXECUTION_FAILED,
                result.summary,
                retryable=None,
            )

        if result.outcome is ExecutionOutcome.CANCELLED:
            return self._cancel_agent_run(
                run,
                agent_run,
                AgentRunReasonCode.CANCELLATION_CONFIRMED,
                result.summary,
            )

        # UNKNOWN is never converted into SUCCESS.
        return self._block_agent_run(
            run,
            agent_run,
            AgentRunReasonCode.EXECUTION_RESULT_UNKNOWN,
            result.summary,
        )

    def _fail_agent_run(
        self,
        run: Run,
        agent_run: AgentRun,
        reason_code: AgentRunReasonCode,
        reason_summary: str,
        *,
        retryable: bool | None,
    ) -> AgentRun:
        failed = self._agent_runs.transition(
            agent_run,
            AgentRunStatus.FAILED,
            reason_code=reason_code,
            reason_summary=reason_summary,
        )

        payload: tuple[tuple[str, str | int | bool | None], ...] = (
            ("failure_code", reason_code.value),
            ("safe_summary", reason_summary),
        )

        if retryable is not None:
            payload = payload + (("retryable", retryable),)

        self._events.emit(
            run,
            EventType.AGENT_FAILED,
            source=EventSource.EXECUTOR,
            agent_run_id=failed.id,
            payload=payload,
        )

        return failed

    def _block_agent_run(
        self,
        run: Run,
        agent_run: AgentRun,
        reason_code: AgentRunReasonCode,
        reason_summary: str,
        *,
        capability_snapshot: CapabilityReport | None = None,
    ) -> AgentRun:
        blocked = self._agent_runs.transition(
            agent_run,
            AgentRunStatus.BLOCKED,
            reason_code=reason_code,
            reason_summary=reason_summary,
            capability_snapshot=capability_snapshot,
        )

        self._events.emit(
            run,
            EventType.AGENT_BLOCKED,
            source=EventSource.EXECUTOR,
            agent_run_id=blocked.id,
            payload=(
                ("reason_code", reason_code.value),
                ("summary", reason_summary),
            ),
        )

        return blocked

    def _wait_agent_run(
        self,
        run: Run,
        agent_run: AgentRun,
        reason_code: AgentRunReasonCode,
        reason_summary: str,
    ) -> AgentRun:
        waiting = self._agent_runs.transition(
            agent_run,
            AgentRunStatus.WAITING,
            reason_code=reason_code,
            reason_summary=reason_summary,
        )

        self._events.emit(
            run,
            EventType.AGENT_WAITING,
            source=EventSource.EXECUTOR,
            agent_run_id=waiting.id,
            payload=(
                ("reason_code", reason_code.value),
                ("summary", reason_summary),
            ),
        )

        return waiting

    def _cancel_agent_run(
        self,
        run: Run,
        agent_run: AgentRun,
        reason_code: AgentRunReasonCode,
        reason_summary: str,
    ) -> AgentRun:
        cancelled = self._agent_runs.transition(
            agent_run,
            AgentRunStatus.CANCELLED,
            reason_code=reason_code,
            reason_summary=reason_summary,
        )

        self._events.emit(
            run,
            EventType.AGENT_CANCELLED,
            source=EventSource.EXECUTOR,
            agent_run_id=cancelled.id,
            payload=(("summary", reason_summary),),
        )

        return cancelled

    def reconcile_stage(self, run: Run, stage_key: StageKey) -> Run:
        """Re-evaluate one stage from the factual state of its AgentRuns.

        Used after an externally delivered AgentRun event and after in-process
        execution. It is idempotent, emits a stage transition event only when
        the stage status actually changes, and never regresses a terminal stage
        or a terminal Run.
        """

        if is_terminal_run_status(run.status):
            return run

        stage = self._stages.get(run.id, stage_key)

        if stage is None or is_terminal_run_stage_status(stage.status):
            return run

        return self._complete_stage(run, stage_key)

    def _complete_stage(self, run: Run, stage_key: StageKey) -> Run:
        stage = self._stages.get(run.id, stage_key)

        if stage is None or is_terminal_run_stage_status(stage.status):
            return run

        if is_terminal_run_status(run.status):
            return run

        agent_runs = self._agent_runs.list_for_stage(run.id, stage_key)

        if not agent_runs:
            return run

        required_keys = self._required_profile_keys(run, stage_key)
        required_runs = [
            agent_run for agent_run in agent_runs if agent_run.agent_profile_key in required_keys
        ]

        blocked = [
            agent_run for agent_run in required_runs if agent_run.status is AgentRunStatus.BLOCKED
        ]

        if blocked:
            self._transition_stage(
                run,
                stage,
                RunStageStatus.BLOCKED,
                StageReasonCode.UNKNOWN_EXECUTION_STATE,
                blocked[0].reason_summary
                or "A required assignment has an unresolved execution state.",
            )
            return self._block(
                run,
                RunReasonCode.UNKNOWN_EXECUTION_STATE,
                f"Stage {stage.stage_key.value} has an unresolved required assignment.",
            )

        failed = [
            agent_run for agent_run in required_runs if agent_run.status is AgentRunStatus.FAILED
        ]

        if failed:
            self._transition_stage(
                run,
                stage,
                RunStageStatus.FAILED,
                StageReasonCode.REQUIRED_AGENT_FAILED,
                (
                    f"Required assignment {failed[0].agent_profile_key} failed: "
                    f"{failed[0].reason_summary or 'no safe summary'}"
                ),
            )
            return self._fail_run(
                run,
                RunReasonCode.REQUIRED_STAGE_FAILED,
                f"Required stage {stage.stage_key.value} failed.",
            )

        cancelled = [
            agent_run for agent_run in required_runs if agent_run.status is AgentRunStatus.CANCELLED
        ]

        if cancelled:
            self._transition_stage(
                run,
                stage,
                RunStageStatus.CANCELLED,
                StageReasonCode.RUN_CANCELLED,
                "A required assignment was cancelled.",
            )
            return self._cancel_run_internal(run)

        unresolved = [
            agent_run
            for agent_run in required_runs
            if not is_terminal_agent_run_status(agent_run.status)
        ]

        if unresolved:
            if any(agent_run.status is AgentRunStatus.WAITING for agent_run in unresolved):
                self._transition_stage(
                    run,
                    stage,
                    RunStageStatus.WAITING,
                    StageReasonCode.EXECUTOR_WAITING,
                    "A required assignment is waiting for the executor.",
                )

            # Otherwise a required assignment is still actively running.
            return run

        self._transition_stage(run, stage, RunStageStatus.COMPLETED)

        return run

    def _transition_stage(
        self,
        run: Run,
        stage: RunStageState,
        status: RunStageStatus,
        reason_code: StageReasonCode | None = None,
        reason_summary: str | None = None,
    ) -> RunStageState:
        """Transition a stage and emit its event exactly once per change."""

        updated = self._stages.transition(
            stage,
            status,
            reason_code=reason_code,
            reason_summary=reason_summary,
        )

        if updated.status is stage.status:
            return updated

        event_type = _STAGE_EVENTS[status]
        payload: tuple[tuple[str, str | int | bool | None], ...] = (
            ("stage_key", stage.stage_key.value),
        )

        if reason_code is not None:
            payload = payload + (("reason_code", reason_code.value),)

        self._events.emit(
            run,
            event_type,
            source=EventSource.ORCHESTRATOR,
            payload=payload,
        )

        return updated

    def _required_profile_keys(self, run: Run, stage_key: StageKey) -> frozenset[str]:
        """Return the profile keys that must succeed for a stage to complete.

        Required-ness is frozen assignment authority, taken from the Run's
        WorkflowSnapshot. An AgentRun whose profile is not in the frozen
        assignment set is treated as required, which is the conservative
        reading.
        """

        snapshot = self._workflows.find_snapshot(run.id)

        if snapshot is None:
            return frozenset(
                agent_run.agent_profile_key
                for agent_run in self._agent_runs.list_for_stage(run.id, stage_key)
            )

        assignments = snapshot.assignments_for(stage_key)
        required = frozenset(
            assignment.profile_key for assignment in assignments if assignment.required
        )
        known = {assignment.profile_key for assignment in assignments}

        for agent_run in self._agent_runs.list_for_stage(run.id, stage_key):
            if agent_run.agent_profile_key not in known:
                required = required | {agent_run.agent_profile_key}

        return required

    # ------------------------------------------------------------------
    # Phase projection and terminal transitions
    # ------------------------------------------------------------------

    def _apply_phase(self, run: Run, stage_key: StageKey) -> Run:
        target = _STAGE_RUN_PHASE[stage_key]

        if run.status is target or not run_transition_allowed(run.status, target):
            return run

        updated = self._runs.transition(run, target)
        phase_event = _PHASE_EVENTS.get(target)

        if phase_event is not None:
            self._events.emit(updated, phase_event, source=EventSource.ORCHESTRATOR)

        return updated

    def _finalize(self, run: Run, stages: tuple[RunStageState, ...]) -> Run:
        """Evaluate completion gates once every stage is terminal."""

        cancelled = [stage for stage in stages if stage.status is RunStageStatus.CANCELLED]

        if cancelled:
            return self._cancel_run_internal(run)

        failed = [stage for stage in stages if stage.status is RunStageStatus.FAILED]

        if failed:
            return self._fail_run(
                run,
                RunReasonCode.REQUIRED_STAGE_FAILED,
                f"Stage {failed[0].stage_key.value} failed.",
            )

        unsatisfied = [
            stage
            for stage in stages
            if stage.required
            and stage.status is not RunStageStatus.COMPLETED
            and stage.status is not RunStageStatus.SKIPPED
        ]

        if unsatisfied:
            return self._block(
                run,
                RunReasonCode.DEPENDENCY_NOT_COMPLETE,
                f"Required stage {unsatisfied[0].stage_key.value} did not complete.",
            )

        unresolved = [
            agent_run
            for agent_run in self._agent_runs.list_for_run(run.id)
            if not is_terminal_agent_run_status(agent_run.status)
        ]

        if unresolved:
            return self._block(
                run,
                RunReasonCode.UNKNOWN_EXECUTION_STATE,
                "A required assignment still has an unresolved execution state.",
            )

        completed_stages = sum(1 for stage in stages if stage.status is RunStageStatus.COMPLETED)
        skipped_stages = sum(1 for stage in stages if stage.status is RunStageStatus.SKIPPED)

        completed = self._runs.transition(run, RunStatus.COMPLETED)
        self._events.emit(
            completed,
            EventType.RUN_COMPLETED,
            source=EventSource.ORCHESTRATOR,
            payload=(
                ("completion_mode", "READY_FOR_REVIEW"),
                ("completed_stages", completed_stages),
                ("skipped_stages", skipped_stages),
            ),
        )

        return completed

    def _fail_run(self, run: Run, reason_code: RunReasonCode, summary: str) -> Run:
        if is_terminal_run_status(run.status):
            return run

        failed = self._runs.transition(
            run,
            RunStatus.FAILED,
            reason_code=reason_code,
            reason_summary=summary,
        )
        self._events.emit(
            failed,
            EventType.RUN_FAILED,
            source=EventSource.ORCHESTRATOR,
            payload=(
                ("reason_code", reason_code.value),
                ("summary", summary),
            ),
        )

        return failed

    def _block(self, run: Run, reason_code: RunReasonCode, summary: str) -> Run:
        if is_terminal_run_status(run.status) or run.status is RunStatus.BLOCKED:
            return run

        blocked = self._runs.transition(
            run,
            RunStatus.BLOCKED,
            reason_code=reason_code,
            reason_summary=summary,
        )
        self._events.emit(
            blocked,
            EventType.RUN_BLOCKED,
            source=EventSource.ORCHESTRATOR,
            payload=(
                ("reason_code", reason_code.value),
                ("summary", summary),
            ),
        )

        return blocked

    def _cancel_run_internal(self, run: Run) -> Run:
        if is_terminal_run_status(run.status):
            return run

        for stage in self._stages.list_for_run(run.id):
            if stage.status in {
                RunStageStatus.PENDING,
                RunStageStatus.READY,
                RunStageStatus.RUNNING,
                RunStageStatus.WAITING,
            }:
                self._stages.transition(
                    stage,
                    RunStageStatus.CANCELLED,
                    reason_code=StageReasonCode.RUN_CANCELLED,
                    reason_summary="The Run was cancelled.",
                )
                self._events.emit(
                    run,
                    EventType.STAGE_CANCELLED,
                    source=EventSource.ORCHESTRATOR,
                    payload=(("stage_key", stage.stage_key.value),),
                )

        cancelled = self._runs.transition(run, RunStatus.CANCELLED)
        self._events.emit(cancelled, EventType.RUN_CANCELLED, source=EventSource.ORCHESTRATOR)

        return cancelled

    # ------------------------------------------------------------------
    # Cancellation
    # ------------------------------------------------------------------

    async def cancel_run(self, run_id: RunId) -> Run:
        """Request Run cancellation without assuming it happened.

        A cancellation request is never treated as proof of termination. When
        the Executor cannot confirm cancellation, the Run is blocked instead of
        claiming CANCELLED.
        """

        run = self._runs.get_run(run_id)

        if is_terminal_run_status(run.status):
            return run

        run = self._runs.record_cancel_request(run)
        self._events.emit(run, EventType.RUN_CANCEL_REQUESTED, source=EventSource.USER)

        active = [
            agent_run
            for agent_run in self._agent_runs.list_for_run(run.id)
            if not is_terminal_agent_run_status(agent_run.status)
        ]

        if not active:
            return self._cancel_run_internal(run)

        unknown = False
        unconfirmed = False

        for agent_run in active:
            outcome = await self._request_agent_run_cancellation(run, agent_run)

            if outcome is CancellationOutcome.UNKNOWN:
                unknown = True
            elif outcome is not CancellationOutcome.CONFIRMED_CANCELLED:
                unconfirmed = True

        if unknown:
            return self._block(
                run,
                RunReasonCode.CANCELLATION_UNKNOWN,
                "Cancellation outcome is unknown; the Run cannot claim to be cancelled.",
            )

        if unconfirmed:
            # Cancellation was requested but not acknowledged. The Run must not
            # claim CANCELLED, and the persisted Run is returned unchanged.
            return self._runs.get_run(run.id)

        return self._cancel_run_internal(run)

    async def _request_agent_run_cancellation(
        self,
        run: Run,
        agent_run: AgentRun,
    ) -> CancellationOutcome:
        self._events.emit(
            run,
            EventType.AGENT_CANCEL_REQUESTED,
            source=EventSource.ORCHESTRATOR,
            agent_run_id=agent_run.id,
            payload=(("stage_key", agent_run.stage_key.value),),
        )

        session = agent_run.executor_session_ref

        if session is None:
            # Nothing external is running for this assignment.
            self._cancel_agent_run(
                run,
                agent_run,
                AgentRunReasonCode.CANCELLATION_CONFIRMED,
                "The assignment had no active executor session.",
            )
            return CancellationOutcome.CONFIRMED_CANCELLED

        registered = self._executors.get(agent_run.executor_id)

        if registered is None:
            self._block_agent_run(
                run,
                agent_run,
                AgentRunReasonCode.CANCELLATION_UNKNOWN,
                "The Executor of this assignment is no longer registered.",
            )
            return CancellationOutcome.UNKNOWN

        result = await registered.adapter.cancel(session)

        if result.outcome is CancellationOutcome.CONFIRMED_CANCELLED:
            self._cancel_agent_run(
                run,
                agent_run,
                AgentRunReasonCode.CANCELLATION_CONFIRMED,
                result.safe_summary or "Cancellation was confirmed.",
            )
            return result.outcome

        if result.outcome is CancellationOutcome.REQUESTED:
            self._agent_runs.transition(
                agent_run,
                AgentRunStatus.WAITING,
                reason_code=AgentRunReasonCode.CANCELLATION_REQUESTED_UNCONFIRMED,
                reason_summary=(
                    result.safe_summary or "Cancellation was requested but not confirmed."
                ),
            )
            return result.outcome

        if result.outcome is CancellationOutcome.ALREADY_TERMINAL:
            # The executor session already ended. That is not proof that this
            # Run was cancelled, so no Run state is claimed here.
            return result.outcome

        self._block_agent_run(
            run,
            agent_run,
            AgentRunReasonCode.CANCELLATION_UNKNOWN,
            result.safe_summary or "Cancellation outcome is unknown.",
        )
        return CancellationOutcome.UNKNOWN

    # ------------------------------------------------------------------
    # External event application
    # ------------------------------------------------------------------

    async def apply_external_event(self, event: Event) -> EventProcessingResult:
        """Ingest a normalized event and apply its guarded state transition.

        Duplicate delivery is idempotent, and a late event never regresses
        terminal state.
        """

        run = self._runs.get_run(event.run_id)

        if event.project_id != run.project_id:
            raise EventScopeError(
                f"Event {event.id} declares a Project that does not own Run {run.id}"
            )

        if event.agent_run_id is not None:
            agent_run = self._agent_runs.get(event.agent_run_id)

            if agent_run.run_id != run.id or agent_run.project_id != run.project_id:
                raise EventScopeError(
                    f"Event {event.id} references an AgentRun from a different Run"
                )

        persisted = self._events.record(event)

        if not persisted:
            return EventProcessingResult(
                persisted=False,
                duplicate=True,
                state_changed=False,
                ignored_for_state_reason="duplicate_event",
                diagnostics=("duplicate_event",),
            )

        changed, reason, diagnostics = self._apply_event_state(event)

        if changed and not is_terminal_run_status(run.status):
            refreshed = self._runs.get_run(run.id)

            if refreshed.workflow_snapshot_id is not None and event.agent_run_id is not None:
                # The AgentRun changed, so its owning stage must be re-evaluated
                # before downstream stages can become eligible.
                refreshed = self.reconcile_stage(
                    refreshed,
                    self._agent_runs.get(event.agent_run_id).stage_key,
                )

                if not is_terminal_run_status(refreshed.status):
                    await self._advance(self._runs.get_run(refreshed.id))

        return EventProcessingResult(
            persisted=True,
            duplicate=False,
            state_changed=changed,
            ignored_for_state_reason=reason,
            diagnostics=diagnostics,
        )

    def _apply_event_state(self, event: Event) -> tuple[bool, str | None, tuple[str, ...]]:
        target = _AGENT_EVENT_STATUS.get(event.event_type)

        if target is None or event.agent_run_id is None:
            return False, "no_state_mapping", ()

        agent_run = self._agent_runs.get(event.agent_run_id)

        if agent_run.status is target:
            return False, "already_in_target_state", ()

        if is_terminal_agent_run_status(agent_run.status):
            diagnostics = (
                ("provider_contradiction",)
                if target is not AgentRunStatus.CANCELLED
                else ("stale_event",)
            )
            return False, "terminal_state_preserved", diagnostics

        self._agent_runs.transition(agent_run, target)
        return True, None, ()

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _resolved_executor(self, run: Run) -> RegisteredExecutor | None:
        if run.resolved_executor_id is None:
            return None

        return self._executors.get(run.resolved_executor_id)


def _compose_instruction(agent_run: AgentRun, task_title: str) -> str:
    """Compose a bounded, safe instruction for one assignment."""

    instruction = (
        f"Agent role: {agent_run.agent_profile_key}\n"
        f"Workflow stage: {agent_run.stage_key.value}\n"
        f"Access mode: {agent_run.access_mode.value}\n"
        f"Task: {task_title}"
    )

    if len(instruction) > MAX_INSTRUCTION_LENGTH:
        return instruction[: MAX_INSTRUCTION_LENGTH - 1] + "…"

    return instruction
