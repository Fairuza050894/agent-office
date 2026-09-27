"""Provider-neutral planning runtime port and deterministic reference runtime."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

from agent_office.domain import PlanningArtifactType


@dataclass(frozen=True, slots=True)
class PlanningRuntimeCapabilities:
    read_only: bool
    structured_output: bool
    cancellable: bool


@dataclass(frozen=True, slots=True)
class PlanningArtifactDraft:
    artifact_type: PlanningArtifactType
    title: str
    content: tuple[tuple[str, str | int | bool | None], ...]


@dataclass(frozen=True, slots=True)
class RequirementDraft:
    title: str
    problem: str
    requirement: str
    rationale: str
    acceptance_hint: str | None = None


@dataclass(frozen=True, slots=True)
class PlanningContribution:
    role_key: str
    summary: str
    artifacts: tuple[PlanningArtifactDraft, ...] = ()
    requirements: tuple[RequirementDraft, ...] = ()


class PlanningRuntime(Protocol):
    async def describe_capabilities(self) -> PlanningRuntimeCapabilities: ...
    async def contribute(
        self,
        *,
        role_key: str,
        instruction: str,
    ) -> PlanningContribution: ...
    async def cancel(self) -> bool: ...


class ReferencePlanningRuntime:
    """Deterministic fixture runtime.

    This runtime exists to prove lifecycle and persistence boundaries. It is not
    provider intelligence and is not wired to the production HTTP composer.
    """

    async def describe_capabilities(self) -> PlanningRuntimeCapabilities:
        return PlanningRuntimeCapabilities(
            read_only=True,
            structured_output=True,
            cancellable=True,
        )

    async def contribute(
        self,
        *,
        role_key: str,
        instruction: str,
    ) -> PlanningContribution:
        role = role_key.strip()
        prompt = instruction.strip()

        if not role or not prompt:
            raise ValueError("Reference planning contribution requires role and instruction")

        return PlanningContribution(
            role_key=role,
            summary=f"Reference planning contribution for {role}.",
            artifacts=(
                PlanningArtifactDraft(
                    artifact_type=PlanningArtifactType.NOTE,
                    title="Reference planning note",
                    content=(
                        ("role", role),
                        ("instruction", prompt[:512]),
                    ),
                ),
            ),
        )

    async def cancel(self) -> bool:
        return True
