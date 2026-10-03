"""FastAPI dependency boundaries for Agent Office."""

from typing import cast

from fastapi import Request

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
from agent_office.application.results import ResultReviewService
from agent_office.application.review import FindingService
from agent_office.application.runs import RunService, RunStageService
from agent_office.application.tasks import TaskService
from agent_office.application.verification import VerificationService
from agent_office.application.workflows import WorkflowService
from agent_office.application.workspaces import WorkspaceService
from agent_office.persistence import SQLiteDatabase


def _database(request: Request) -> SQLiteDatabase:
    return cast(SQLiteDatabase, request.app.state.project_database)


def get_project_service(request: Request) -> ProjectService:
    """Return the Project service after ensuring its schema exists."""

    database = _database(request)
    service = cast(
        ProjectService,
        request.app.state.project_service,
    )

    database.initialize()
    return service


def get_task_service(request: Request) -> TaskService:
    """Return the Task service (database already initialized by project dep)."""

    database = _database(request)
    service = cast(
        TaskService,
        request.app.state.task_service,
    )

    database.initialize()
    return service


def get_run_service(request: Request) -> RunService:
    """Return the Run service (database already initialized by project dep)."""

    database = _database(request)
    service = cast(
        RunService,
        request.app.state.run_service,
    )

    database.initialize()
    return service


def get_workflow_service(request: Request) -> WorkflowService:
    """Return the Workflow service with built-in definitions registered."""

    database = _database(request)
    service = cast(
        WorkflowService,
        request.app.state.workflow_service,
    )

    database.initialize()
    service.ensure_built_in_definitions()
    return service


def get_event_service(request: Request) -> EventService:
    """Return the Event service."""

    database = _database(request)
    service = cast(
        EventService,
        request.app.state.event_service,
    )

    database.initialize()
    return service


def get_stage_service(request: Request) -> RunStageService:
    """Return the stage runtime state service."""

    database = _database(request)
    service = cast(
        RunStageService,
        request.app.state.stage_service,
    )

    database.initialize()
    return service


def get_orchestrator(request: Request) -> RunOrchestrator:
    """Return the Run orchestrator with built-in workflows registered."""

    database = _database(request)
    workflows = cast(
        WorkflowService,
        request.app.state.workflow_service,
    )
    orchestrator = cast(
        RunOrchestrator,
        request.app.state.orchestrator,
    )

    database.initialize()
    workflows.ensure_built_in_definitions()
    return orchestrator


def get_audit_service(request: Request) -> AuditService:
    """Return the append-only AuditRecord service."""

    database = _database(request)
    service = cast(
        AuditService,
        request.app.state.audit_service,
    )

    database.initialize()
    return service


def get_recovery_service(request: Request) -> RecoveryService:
    """Return the restart recovery discovery service."""

    database = _database(request)
    service = cast(
        RecoveryService,
        request.app.state.recovery_service,
    )

    database.initialize()
    return service


def get_workspace_service(request: Request) -> WorkspaceService:
    """Return the Workspace coordination service."""

    database = _database(request)
    service = cast(
        WorkspaceService,
        request.app.state.workspace_service,
    )

    database.initialize()
    return service


def get_finding_service(request: Request) -> FindingService:
    """Return the process-wide Finding service after ensuring its schema."""

    _database(request).initialize()

    return cast(FindingService, request.app.state.finding_service)


def get_verification_service(request: Request) -> VerificationService:
    """Return the process-wide verification service after ensuring its schema."""

    _database(request).initialize()

    return cast(VerificationService, request.app.state.verification_service)


def get_result_review_service(request: Request) -> ResultReviewService:
    """Return the human result-review and managed-delivery service."""

    _database(request).initialize()
    return cast(ResultReviewService, request.app.state.result_review_service)


def get_composer_thread_service(request: Request) -> ComposerThreadService:
    """Return the durable Composer thread service."""

    _database(request).initialize()
    return cast(ComposerThreadService, request.app.state.composer_thread_service)


def get_planning_event_service(request: Request) -> PlanningEventService:
    """Return the separate planning-event service."""

    _database(request).initialize()
    return cast(PlanningEventService, request.app.state.planning_event_service)


def get_team_proposal_service(request: Request) -> TeamProposalService:
    """Return the durable TeamProposal service."""

    _database(request).initialize()
    return cast(TeamProposalService, request.app.state.team_proposal_service)


def get_planning_artifact_service(request: Request) -> PlanningArtifactService:
    """Return the structured planning-artifact service."""

    _database(request).initialize()
    return cast(PlanningArtifactService, request.app.state.planning_artifact_service)


def get_requirement_service(request: Request) -> RequirementService:
    """Return RequirementCandidate lifecycle service."""

    _database(request).initialize()
    return cast(RequirementService, request.app.state.requirement_service)


def get_universal_composer_planning_service(
    request: Request,
) -> UniversalComposerPlanningService:
    """Return deterministic Phase 9C Composer preparation service."""

    _database(request).initialize()
    return cast(
        UniversalComposerPlanningService,
        request.app.state.universal_composer_planning_service,
    )
