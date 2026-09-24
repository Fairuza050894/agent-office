"""Read-only operational registries for AgentProfiles and Executors."""

from __future__ import annotations

from fastapi import APIRouter, Request

from agent_office.api.resources_models import AgentProfileResponse, ExecutorResponse
from agent_office.application.workflows import WorkflowService
from agent_office.infrastructure.executors import ExecutorRegistry

router = APIRouter(tags=["resources"])


@router.get("/api/agent-profiles", response_model=list[AgentProfileResponse])
def list_agent_profiles(request: Request) -> list[AgentProfileResponse]:
    """Return the deployment's reusable AgentProfile catalog."""

    service: WorkflowService = request.app.state.workflow_service
    return [
        AgentProfileResponse.from_domain(profile)
        for profile in service.agent_profiles.profiles
    ]


@router.get("/api/executors", response_model=list[ExecutorResponse])
async def list_executors(request: Request) -> list[ExecutorResponse]:
    """Return factual health and capability observations for registered Executors."""

    registry: ExecutorRegistry = request.app.state.executor_registry
    responses: list[ExecutorResponse] = []

    for registered in registry.list():
        health = await registered.adapter.health()
        capability_report = await registered.adapter.capabilities()
        responses.append(
            ExecutorResponse.from_observations(
                registered.descriptor,
                health,
                capability_report.capabilities,
            )
        )

    return responses
