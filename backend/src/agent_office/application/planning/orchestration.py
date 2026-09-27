"""Universal Composer preparation orchestration for Phase 9C.

The service turns one durable user message into deterministic planning metadata.
It does not call a model, allocate a Workspace, or create Task/Run truth.
"""

from __future__ import annotations

from dataclasses import dataclass

from agent_office.application.planning.intent import IntentResolution, IntentResolver
from agent_office.application.planning.service import (
    ComposerThreadService,
    PlanningArtifactService,
    RequirementService,
    TeamProposalService,
)
from agent_office.application.planning.team_formation import DynamicTeamFormationService
from agent_office.application.projects import ProjectService
from agent_office.domain import (
    ComposerActorType,
    ComposerMessage,
    ComposerThread,
    ComposerThreadId,
    PlanningArtifact,
    PlanningArtifactStatus,
    PlanningArtifactType,
    RequirementCandidate,
    TeamMemberDisposition,
    TeamProposal,
    TeamProposalMember,
)


@dataclass(frozen=True, slots=True)
class ComposerPreparation:
    thread: ComposerThread
    resolution: IntentResolution
    team_proposal: TeamProposal
    team_members: tuple[TeamProposalMember, ...]
    artifacts: tuple[PlanningArtifact, ...]
    requirements: tuple[RequirementCandidate, ...]


class UniversalComposerPlanningService:
    def __init__(
        self,
        composer: ComposerThreadService,
        teams: TeamProposalService,
        artifacts: PlanningArtifactService,
        requirements: RequirementService,
        projects: ProjectService,
        *,
        intent_resolver: IntentResolver | None = None,
        team_formation: DynamicTeamFormationService | None = None,
    ) -> None:
        self._composer = composer
        self._teams = teams
        self._artifacts = artifacts
        self._requirements = requirements
        self._projects = projects
        self._intent_resolver = intent_resolver or IntentResolver()
        self._team_formation = team_formation or DynamicTeamFormationService()

    def prepare(self, thread_id: ComposerThreadId) -> ComposerPreparation:
        thread = self._composer.get_thread(thread_id)
        messages = self._composer.list_messages(thread.id)
        latest_user = _latest_user_message(messages)

        resolution = self._intent_resolver.resolve(
            requested_intent=thread.requested_intent,
            instruction=latest_user.content,
            project_selected=thread.project_id is not None,
        )

        if (
            thread.resolved_intent is not None
            and thread.resolved_intent is not resolution.resolved_intent
        ):
            raise ValueError(
                "Latest user message conflicts with the immutable resolved intent "
                f"{thread.resolved_intent.value}"
            )

        thread = self._composer.resolve_intent(
            thread.id,
            resolved_intent=resolution.resolved_intent,
            reason_summary=resolution.reason_summary,
            requires_user_action=resolution.requires_user_action,
        )

        existing_teams = self._teams.list_for_thread(thread.id)
        if existing_teams:
            proposal, members = existing_teams[-1]
        else:
            formation = self._team_formation.form(
                resolution=resolution,
                instruction=latest_user.content,
                project_selected=thread.project_id is not None,
            )
            proposal, members = self._teams.propose(
                thread.id,
                phase=formation.phase,
                rationale_summary=formation.rationale_summary,
                members=tuple(
                    (member.role_key, member.disposition, member.reason)
                    for member in formation.members
                ),
            )

        existing_artifacts = self._artifacts.list_for_thread(thread.id)
        if not _has_artifact(
            existing_artifacts,
            PlanningArtifactType.BRIEF,
            "Project re-entry brief",
        ):
            self._create_reentry_brief(
                thread=thread,
                instruction=latest_user.content,
                resolution=resolution,
                members=members,
            )

        deferred_roles = tuple(
            member.role_key
            for member in members
            if member.disposition is TeamMemberDisposition.DEFERRED
        )
        if deferred_roles and not _has_artifact(
            existing_artifacts,
            PlanningArtifactType.ACTION,
            "Deferred implementation",
        ):
            self._artifacts.create(
                thread.id,
                artifact_type=PlanningArtifactType.ACTION,
                title="Deferred implementation",
                status=PlanningArtifactStatus.OPEN,
                author_role_key="product-manager",
                content=(
                    ("state", "DEFERRED"),
                    ("roles", ", ".join(deferred_roles)),
                    (
                        "reason",
                        "Implementation roles remain inactive until requirements are approved.",
                    ),
                    (
                        "resume_when",
                        "A later execution proposal is explicitly approved by the user.",
                    ),
                ),
            )

        if resolution.requires_user_action and not _has_artifact(
            existing_artifacts,
            PlanningArtifactType.QUESTION,
            "Decision required",
        ):
            self._artifacts.create(
                thread.id,
                artifact_type=PlanningArtifactType.QUESTION,
                title="Decision required",
                status=PlanningArtifactStatus.OPEN,
                author_role_key="product-manager",
                content=(
                    (
                        "question",
                        (
                            "Confirm the Project and approved planning scope before "
                            "repository-changing execution."
                        ),
                    ),
                    ("option_a", "Continue in read-only planning mode."),
                    (
                        "option_b",
                        "Select/confirm the Project, then review and approve requirements.",
                    ),
                    ("option_c", "Defer this work."),
                    (
                        "recommendation",
                        "Continue planning first; do not start repository-changing work yet.",
                    ),
                ),
            )

        return ComposerPreparation(
            thread=thread,
            resolution=resolution,
            team_proposal=proposal,
            team_members=members,
            artifacts=self._artifacts.list_for_thread(thread.id),
            requirements=self._requirements.list_for_thread(thread.id),
        )

    def _create_reentry_brief(
        self,
        *,
        thread: ComposerThread,
        instruction: str,
        resolution: IntentResolution,
        members: tuple[TeamProposalMember, ...],
    ) -> PlanningArtifact:
        project_name = "Unscoped"
        default_branch = "UNAVAILABLE"
        project_status = "UNSCOPED"

        prior_thread_count = 0
        latest_prior_title = "NONE"
        latest_prior_status = "NONE"

        if thread.project_id is not None:
            project = self._projects.get_project(thread.project_id)
            project_name = project.name
            default_branch = project.default_branch
            project_status = project.status.value
            prior_threads = tuple(
                candidate
                for candidate in self._composer.list_for_project(thread.project_id)
                if candidate.id != thread.id
            )
            prior_thread_count = len(prior_threads)
            if prior_threads:
                latest_prior = prior_threads[0]
                latest_prior_title = latest_prior.title or str(latest_prior.id)
                latest_prior_status = latest_prior.status.value

        included = ", ".join(
            member.role_key
            for member in members
            if member.disposition is TeamMemberDisposition.INCLUDED
        )
        deferred = ", ".join(
            member.role_key
            for member in members
            if member.disposition is TeamMemberDisposition.DEFERRED
        )

        return self._artifacts.create(
            thread.id,
            artifact_type=PlanningArtifactType.BRIEF,
            title="Project re-entry brief",
            status=PlanningArtifactStatus.OPEN,
            author_role_key="system-analyst",
            content=(
                ("project", project_name),
                ("default_branch", default_branch),
                ("project_status", project_status),
                ("prior_planning_threads", prior_thread_count),
                ("latest_prior_thread", latest_prior_title),
                ("latest_prior_status", latest_prior_status),
                ("instruction", instruction),
                ("requested_intent", thread.requested_intent.value),
                ("resolved_intent", resolution.resolved_intent.value),
                ("planning_roles", included),
                ("deferred_roles", deferred),
                (
                    "repository_state",
                    "NOT_INSPECTED_IN_PHASE_9C",
                ),
                (
                    "repository_context_gate",
                    "Phase 9D must use a bounded read-only context resolver.",
                ),
                ("execution_state", "NOT_STARTED"),
                (
                    "execution_gate",
                    "Approved requirements plus explicit execution promotion are required.",
                ),
            ),
        )


def _latest_user_message(messages: tuple[ComposerMessage, ...]) -> ComposerMessage:
    for message in reversed(messages):
        if message.actor_type is ComposerActorType.USER:
            return message
    raise ValueError("Composer thread has no user message to prepare")



def _has_artifact(
    artifacts: tuple[PlanningArtifact, ...],
    artifact_type: PlanningArtifactType,
    title: str,
) -> bool:
    return any(
        artifact.artifact_type is artifact_type and artifact.title == title
        for artifact in artifacts
    )
