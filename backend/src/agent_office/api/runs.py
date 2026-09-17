"""HTTP routes for Run management and orchestration."""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status

from agent_office.api.dependencies import (
    get_orchestrator,
    get_run_service,
    get_task_service,
)
from agent_office.api.run_models import (
    AgentRunResponse,
    CompletionGateResponse,
    CreateRunRequest,
    ResumeRunRequest,
    RunResponse,
    RunStageResponse,
    StartRunRequest,
    WorkflowSnapshotResponse,
)
from agent_office.application.orchestration import RunOrchestrator
from agent_office.application.runs import (
    OwnershipError,
    ProjectArchivedError,
    RunNotFoundError,
    RunNotResumableError,
    RunNotStartableError,
    RunService,
    WorkflowResolutionError,
)
from agent_office.application.tasks import TaskNotFoundError, TaskService
from agent_office.application.workflows import (
    WorkflowNotFoundError,
    WorkflowSnapshotNotFoundError,
)
from agent_office.domain import DomainInvariantError, RunId, RunStatus, TaskId
from agent_office.domain.identifiers import ExecutorId

router = APIRouter(tags=["runs"])

TaskServiceDependency = Annotated[TaskService, Depends(get_task_service)]
RunServiceDependency = Annotated[RunService, Depends(get_run_service)]
OrchestratorDependency = Annotated[RunOrchestrator, Depends(get_orchestrator)]


@router.post(
    "/api/tasks/{task_id}/runs",
    response_model=RunResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_run(
    task_id: UUID,
    request: CreateRunRequest,
    run_service: RunServiceDependency,
) -> RunResponse:
    """Create a durable Run record.

    This records an execution attempt only; it never dispatches an executor and
    never implies that workflow orchestration started.
    """

    try:
        requested_executor_id = (
            ExecutorId.parse(request.requested_executor_id)
            if request.requested_executor_id is not None
            else None
        )
        run = run_service.create_run(
            task_id=TaskId(task_id),
            requested_executor_id=requested_executor_id,
        )
    except TaskNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc
    except ProjectArchivedError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(exc),
        ) from exc
    except DomainInvariantError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(exc),
        ) from exc

    return RunResponse.from_domain(run)


@router.get(
    "/api/tasks/{task_id}/runs",
    response_model=list[RunResponse],
)
def list_runs(
    task_id: UUID,
    task_service: TaskServiceDependency,
    run_service: RunServiceDependency,
) -> list[RunResponse]:
    try:
        task_service.get_task(TaskId(task_id))
    except TaskNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc

    runs = run_service.list_runs(TaskId(task_id))
    return [RunResponse.from_domain(r) for r in runs]


@router.post("/api/runs/{run_id}/start", response_model=RunResponse)
async def start_run(
    run_id: UUID,
    request: StartRunRequest,
    orchestrator: OrchestratorDependency,
) -> RunResponse:
    """Start workflow orchestration for a Run.

    Execution is bound to the resolved Executor adapter. In Phase 3A only the
    deterministic ReferenceExecutor is registered; no real AI runtime is
    reachable through this endpoint.
    """

    try:
        run = await orchestrator.start_run(
            RunId(run_id),
            changed_areas=None if request.changed_areas is None else tuple(request.changed_areas),
        )
    except RunNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc
    except (RunNotStartableError, ProjectArchivedError, WorkflowResolutionError) as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(exc),
        ) from exc
    except WorkflowNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc
    except DomainInvariantError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(exc),
        ) from exc

    return RunResponse.from_domain(run)


@router.post("/api/runs/{run_id}/cancel", response_model=RunResponse)
async def cancel_run(
    run_id: UUID,
    orchestrator: OrchestratorDependency,
) -> RunResponse:
    """Request Run cancellation.

    A cancellation request is not proof of termination. When the Executor
    cannot confirm cancellation the Run is blocked rather than reported as
    cancelled.
    """

    try:
        run = await orchestrator.cancel_run(RunId(run_id))
    except RunNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc
    except DomainInvariantError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(exc),
        ) from exc

    return RunResponse.from_domain(run)


@router.get("/api/runs/{run_id}", response_model=RunResponse)
def get_run(
    run_id: UUID,
    run_service: RunServiceDependency,
) -> RunResponse:
    try:
        run = run_service.get_run(RunId(run_id))
    except RunNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc
    except OwnershipError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=str(exc),
        ) from exc

    return RunResponse.from_domain(run)


@router.post("/api/runs/{run_id}/resume", response_model=RunResponse)
async def resume_run(
    run_id: UUID,
    request: ResumeRunRequest,
    orchestrator: OrchestratorDependency,
) -> RunResponse:
    """Resume a BLOCKED Run after re-validating that it may continue.

    Resume is not restart-from-zero: historical AgentRuns are preserved, the
    frozen workflow snapshot is never changed, and the Run is only continued
    when the blocking condition has actually been resolved.
    """

    executor_id: ExecutorId | None = None

    if request.executor_id is not None:
        try:
            executor_id = ExecutorId.parse(request.executor_id)
        except DomainInvariantError as exc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail=str(exc),
            ) from exc

    try:
        run = await orchestrator.resume_run(
            RunId(run_id),
            executor_id=executor_id,
            changed_areas=(None if request.changed_areas is None else tuple(request.changed_areas)),
        )
    except RunNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc
    except RunNotResumableError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(exc),
        ) from exc
    except DomainInvariantError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(exc),
        ) from exc

    return RunResponse.from_domain(run)


@router.post("/api/runs/{run_id}/reconcile", response_model=RunResponse)
async def reconcile_run(
    run_id: UUID,
    orchestrator: OrchestratorDependency,
) -> RunResponse:
    """Reconcile a non-terminal Run against the Executor's reported truth.

    Reconciliation records only what the Executor can prove. It never starts new
    execution and never recreates an AgentRun; when external state cannot be
    proven the Run is blocked instead of being resumed blindly.
    """

    try:
        run = await orchestrator.reconcile_run(RunId(run_id))
    except RunNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc
    except DomainInvariantError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(exc),
        ) from exc

    return RunResponse.from_domain(run)


@router.get("/api/runs/{run_id}/completion-gates", response_model=CompletionGateResponse)
def get_completion_gates(
    run_id: UUID,
    run_service: RunServiceDependency,
    orchestrator: OrchestratorDependency,
) -> CompletionGateResponse:
    """Return the completion-gate failures currently blocking a Run.

    This is the same authority the orchestrator uses to decide completion, so a
    caller can see exactly why a Run has not completed.
    """

    try:
        run = run_service.get_run(RunId(run_id))
    except RunNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc

    return CompletionGateResponse(
        status=run.status,
        complete=run.status is RunStatus.COMPLETED,
        failures=[code.value for code in orchestrator.completion_gate_failures(RunId(run_id))],
    )


@router.get("/api/runs/{run_id}/snapshot", response_model=WorkflowSnapshotResponse)
def get_run_snapshot(
    run_id: UUID,
    run_service: RunServiceDependency,
    orchestrator: OrchestratorDependency,
) -> WorkflowSnapshotResponse:
    """Return the immutable workflow snapshot frozen for a Run."""

    try:
        run_service.get_run(RunId(run_id))
        snapshot = orchestrator.get_snapshot(RunId(run_id))
    except RunNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc
    except WorkflowSnapshotNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc

    return WorkflowSnapshotResponse.from_domain(snapshot)


@router.get("/api/runs/{run_id}/stages", response_model=list[RunStageResponse])
def list_run_stages(
    run_id: UUID,
    run_service: RunServiceDependency,
    orchestrator: OrchestratorDependency,
) -> list[RunStageResponse]:
    """Return the durable stage runtime state of a Run."""

    try:
        run_service.get_run(RunId(run_id))
    except RunNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc

    return [
        RunStageResponse.from_domain(stage) for stage in orchestrator.list_stages(RunId(run_id))
    ]


@router.get("/api/runs/{run_id}/agents", response_model=list[AgentRunResponse])
def list_run_agents(
    run_id: UUID,
    run_service: RunServiceDependency,
    orchestrator: OrchestratorDependency,
) -> list[AgentRunResponse]:
    """Return every AgentRun of a Run."""

    try:
        run_service.get_run(RunId(run_id))
    except RunNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc

    return [
        AgentRunResponse.from_domain(agent_run)
        for agent_run in orchestrator.list_agent_runs(RunId(run_id))
    ]
