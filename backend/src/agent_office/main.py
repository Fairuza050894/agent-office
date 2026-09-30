"""FastAPI application composition for Agent Office."""

from importlib.metadata import PackageNotFoundError, version

from fastapi import FastAPI

from agent_office.api.audit import router as audit_router
from agent_office.api.events import router as events_router
from agent_office.api.planning import router as planning_router
from agent_office.api.projects import router as projects_router
from agent_office.api.recovery import router as recovery_router
from agent_office.api.resources import router as resources_router
from agent_office.api.review import router as review_router
from agent_office.api.runs import router as runs_router
from agent_office.api.tasks import router as tasks_router
from agent_office.api.workflows import router as workflows_router
from agent_office.api.workspaces import router as workspaces_router
from agent_office.api_models import HealthResponse, VersionResponse
from agent_office.application.agents import AgentRunService
from agent_office.application.audit import AuditService
from agent_office.application.events import EventService
from agent_office.application.orchestration import RunOrchestrator
from agent_office.application.planning import (
    ComposerThreadService,
    PlanningArtifactService,
    PlanningEventService,
    RequirementService,
    TeamProposalService,
    UniversalComposerPlanningService,
)
from agent_office.application.projects import ProjectService
from agent_office.application.recovery import RecoveryService
from agent_office.application.review import FindingService
from agent_office.application.runs import RunService, RunStageService
from agent_office.application.tasks import TaskService
from agent_office.application.verification import VerificationService
from agent_office.application.workflows import WorkflowService
from agent_office.application.workspaces import WorkspaceService
from agent_office.config import Settings, get_settings
from agent_office.domain import AgentProfileCatalog
from agent_office.infrastructure.commands import CommandRunner
from agent_office.infrastructure.executors import (
    CodexExecutionContextResolver,
    CodexExecutor,
    ExecutorRegistry,
    ReferenceExecutor,
    ReferenceScenario,
    RegisteredExecutor,
)
from agent_office.infrastructure.git import GitRepositoryInspector, GitWorktreeManager
from agent_office.infrastructure.persistence import (
    SQLiteAgentRunRepository,
    SQLiteAuditRecordRepository,
    SQLiteComposerMessageRepository,
    SQLiteComposerThreadRepository,
    SQLiteEventRepository,
    SQLiteEvidenceRepository,
    SQLiteFindingRepository,
    SQLitePlanningArtifactRepository,
    SQLitePlanningEventRepository,
    SQLiteProjectRepository,
    SQLiteRequirementCandidateRepository,
    SQLiteRunRepository,
    SQLiteRunStageRepository,
    SQLiteTaskRepository,
    SQLiteTeamProposalRepository,
    SQLiteWorkflowDefinitionRepository,
    SQLiteWorkflowSnapshotRepository,
    SQLiteWorkspaceRepository,
)
from agent_office.logging_config import configure_logging
from agent_office.persistence import SQLiteDatabase


def get_package_version() -> str:
    try:
        return version("agent-office")
    except PackageNotFoundError:
        return "0.0.0"


def create_app(
    settings: Settings | None = None,
    *,
    executor_registry: ExecutorRegistry | None = None,
    agent_profiles: AgentProfileCatalog | None = None,
) -> FastAPI:
    """Compose Agent Office with explicit test seams and opt-in real providers."""

    resolved_settings = settings or get_settings()
    configure_logging(resolved_settings.log_level)

    app = FastAPI(
        title=resolved_settings.app_name,
        version=get_package_version(),
    )

    database = SQLiteDatabase(resolved_settings.database_path)
    project_repository = SQLiteProjectRepository(database)
    task_repository = SQLiteTaskRepository(database)
    run_repository = SQLiteRunRepository(database)
    run_stage_repository = SQLiteRunStageRepository(database)
    agent_run_repository = SQLiteAgentRunRepository(database)
    event_repository = SQLiteEventRepository(database)
    workflow_definition_repository = SQLiteWorkflowDefinitionRepository(database)
    workflow_snapshot_repository = SQLiteWorkflowSnapshotRepository(database)

    inspector = GitRepositoryInspector()
    event_service = EventService(event_repository)
    workflow_service = WorkflowService(
        workflow_definition_repository,
        workflow_snapshot_repository,
        agent_profiles=agent_profiles,
    )
    stage_service = RunStageService(run_stage_repository)
    agent_run_service = AgentRunService(agent_run_repository)
    project_service = ProjectService(project_repository, inspector)
    task_service = TaskService(task_repository, project_repository)
    run_service = RunService(
        run_repository,
        task_repository,
        project_repository,
        event_service,
    )
    audit_service = AuditService(SQLiteAuditRecordRepository(database))

    planning_event_service = PlanningEventService(SQLitePlanningEventRepository(database))
    composer_thread_service = ComposerThreadService(
        SQLiteComposerThreadRepository(database),
        SQLiteComposerMessageRepository(database),
        project_service,
        planning_event_service,
    )
    team_proposal_service = TeamProposalService(
        SQLiteTeamProposalRepository(database),
        composer_thread_service,
        planning_event_service,
    )
    planning_artifact_service = PlanningArtifactService(
        SQLitePlanningArtifactRepository(database),
        composer_thread_service,
        planning_event_service,
        audit_service,
    )
    requirement_service = RequirementService(
        SQLiteRequirementCandidateRepository(database),
        composer_thread_service,
        planning_event_service,
        audit_service,
    )
    universal_composer_planning_service = UniversalComposerPlanningService(
        composer_thread_service,
        team_proposal_service,
        planning_artifact_service,
        requirement_service,
        project_service,
    )

    worktree_manager = GitWorktreeManager(resolved_settings.managed_workspace_root)
    workspace_service = WorkspaceService(
        SQLiteWorkspaceRepository(database),
        worktree_manager,
        project_service=project_service,
        run_service=run_service,
        event_service=event_service,
        audit_service=audit_service,
    )
    finding_service = FindingService(
        SQLiteFindingRepository(database),
        run_service=run_service,
        agent_run_service=agent_run_service,
        workflow_service=workflow_service,
        event_service=event_service,
        audit_service=audit_service,
    )
    verification_service = VerificationService(
        SQLiteEvidenceRepository(database),
        CommandRunner(),
        worktree_manager,
        run_service=run_service,
        workflow_service=workflow_service,
        workspace_service=workspace_service,
        event_service=event_service,
        audit_service=audit_service,
    )

    if executor_registry is None:
        reference_executor = ReferenceExecutor(
            scenario=ReferenceScenario(resolved_settings.reference_scenario),
        )
        registered = [
            RegisteredExecutor(
                descriptor=reference_executor.descriptor(),
                adapter=reference_executor,
            )
        ]

        if resolved_settings.codex_enabled:
            codex_executor = CodexExecutor(
                execution_context_resolver=CodexExecutionContextResolver(
                    agent_run_service=agent_run_service,
                    project_service=project_service,
                    workspace_service=workspace_service,
                    worktree_manager=worktree_manager,
                ),
                executable=resolved_settings.codex_cli_path,
                model=resolved_settings.codex_model,
                start_timeout_seconds=resolved_settings.codex_start_timeout_seconds,
                cancel_timeout_seconds=resolved_settings.codex_cancel_timeout_seconds,
                probe_timeout_seconds=resolved_settings.codex_probe_timeout_seconds,
            )
            registered.append(
                RegisteredExecutor(
                    descriptor=codex_executor.descriptor(),
                    adapter=codex_executor,
                )
            )

        executor_registry = ExecutorRegistry(tuple(registered))

    app.state.project_database = database
    app.state.project_service = project_service
    app.state.task_service = task_service
    app.state.run_service = run_service
    app.state.workflow_service = workflow_service
    app.state.event_service = event_service
    app.state.stage_service = stage_service
    app.state.agent_run_service = agent_run_service
    app.state.executor_registry = executor_registry
    app.state.audit_service = audit_service
    app.state.planning_event_service = planning_event_service
    app.state.composer_thread_service = composer_thread_service
    app.state.team_proposal_service = team_proposal_service
    app.state.planning_artifact_service = planning_artifact_service
    app.state.requirement_service = requirement_service
    app.state.universal_composer_planning_service = universal_composer_planning_service
    app.state.recovery_service = RecoveryService(run_service, agent_run_service)
    app.state.workspace_service = workspace_service
    app.state.finding_service = finding_service
    app.state.verification_service = verification_service
    app.state.orchestrator = RunOrchestrator(
        run_service=run_service,
        task_service=task_service,
        project_service=project_service,
        workflow_service=workflow_service,
        stage_service=stage_service,
        agent_run_service=agent_run_service,
        event_service=event_service,
        executor_registry=executor_registry,
        audit_service=audit_service,
        workspace_service=workspace_service,
        finding_service=finding_service,
        verification_service=verification_service,
    )

    @app.get("/health", response_model=HealthResponse)
    async def health() -> HealthResponse:
        return HealthResponse(status="ok")

    @app.get("/version", response_model=VersionResponse)
    async def application_version() -> VersionResponse:
        return VersionResponse(
            name=resolved_settings.app_name,
            version=get_package_version(),
        )

    app.include_router(projects_router)
    app.include_router(planning_router)
    app.include_router(resources_router)
    app.include_router(review_router)
    app.include_router(tasks_router)
    app.include_router(runs_router)
    app.include_router(workflows_router)
    app.include_router(events_router)
    app.include_router(audit_router)
    app.include_router(recovery_router)
    app.include_router(workspaces_router)

    return app


app = create_app()
