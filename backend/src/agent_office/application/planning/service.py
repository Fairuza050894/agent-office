"""Planning application services.

Planning truth is persistent but distinct from operational Run truth.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import replace
from datetime import datetime

from agent_office.application.audit import AuditService
from agent_office.application.planning.errors import (
    ComposerThreadNotFoundError,
    PlanningTransitionError,
    RequirementCandidateNotFoundError,
    TeamProposalNotFoundError,
)
from agent_office.application.planning.ports import (
    DEFAULT_PLANNING_EVENT_PAGE_SIZE,
    MAX_PLANNING_EVENT_PAGE_SIZE,
    ComposerMessageRepository,
    ComposerThreadRepository,
    PlanningArtifactRepository,
    PlanningEventCursor,
    PlanningEventRepository,
    RequirementCandidateRepository,
    TeamProposalRepository,
)
from agent_office.application.projects import ProjectService
from agent_office.domain import (
    AuditAction,
    AuditActorType,
    AuditTargetType,
    ComposerActorType,
    ComposerIntent,
    ComposerMessage,
    ComposerMessageId,
    ComposerMessageKind,
    ComposerThread,
    ComposerThreadId,
    ComposerThreadStatus,
    DomainInvariantError,
    ExecutorId,
    PlanningArtifact,
    PlanningArtifactId,
    PlanningArtifactStatus,
    PlanningArtifactType,
    PlanningContent,
    PlanningEvent,
    PlanningValue,
    PlanningEventId,
    PlanningEventType,
    ProjectId,
    RequirementCandidate,
    RequirementCandidateId,
    RequirementStatus,
    TeamMemberDisposition,
    TeamPhase,
    TeamProposal,
    TeamProposalId,
    TeamProposalMember,
    TeamProposalStatus,
    WorkflowDefinitionId,
    build_planning_content,
    utc_now,
)

Clock = Callable[[], datetime]


class PlanningEventService:
    def __init__(
        self,
        repository: PlanningEventRepository,
        *,
        clock: Clock = utc_now,
        event_id_factory: Callable[[], PlanningEventId] = PlanningEventId.new,
    ) -> None:
        self._repository = repository
        self._clock = clock
        self._event_id_factory = event_id_factory

    def emit(
        self,
        thread: ComposerThread,
        event_type: PlanningEventType,
        *,
        payload: PlanningContent = (),
        role_key: str | None = None,
    ) -> PlanningEvent:
        now = utc_now(self._clock)
        event = PlanningEvent(
            id=self._event_id_factory(),
            thread_id=thread.id,
            project_id=thread.project_id,
            event_type=event_type,
            occurred_at=now,
            recorded_at=now,
            sequence=self._repository.next_sequence(thread.id),
            payload=build_planning_content(payload),
            role_key=role_key,
        )
        self._repository.append(event)
        return event

    def find(self, event_id: PlanningEventId) -> PlanningEvent | None:
        return self._repository.get(event_id)

    def list_for_thread(
        self,
        thread_id: ComposerThreadId,
        *,
        limit: int = DEFAULT_PLANNING_EVENT_PAGE_SIZE,
        after: PlanningEventCursor | None = None,
    ) -> tuple[PlanningEvent, ...]:
        bounded = (
            DEFAULT_PLANNING_EVENT_PAGE_SIZE
            if limit < 1
            else min(
                limit,
                MAX_PLANNING_EVENT_PAGE_SIZE,
            )
        )
        return self._repository.list_by_thread(thread_id, limit=bounded, after=after)


class ComposerThreadService:
    def __init__(
        self,
        threads: ComposerThreadRepository,
        messages: ComposerMessageRepository,
        projects: ProjectService,
        events: PlanningEventService,
        audit: AuditService,
        *,
        clock: Clock = utc_now,
        thread_id_factory: Callable[[], ComposerThreadId] = ComposerThreadId.new,
        message_id_factory: Callable[[], ComposerMessageId] = ComposerMessageId.new,
    ) -> None:
        self._threads = threads
        self._messages = messages
        self._projects = projects
        self._events = events
        self._audit = audit
        self._clock = clock
        self._thread_id_factory = thread_id_factory
        self._message_id_factory = message_id_factory

    def create_thread(
        self,
        *,
        project_id: ProjectId | None,
        requested_intent: ComposerIntent,
        timezone: str,
        title: str | None = None,
        executor_id: ExecutorId | None = None,
        workflow_id: WorkflowDefinitionId | None = None,
    ) -> ComposerThread:
        if project_id is not None:
            self._projects.get_project(project_id)

        now = utc_now(self._clock)
        thread = ComposerThread(
            id=self._thread_id_factory(),
            project_id=project_id,
            requested_intent=requested_intent,
            resolved_intent=None,
            status=ComposerThreadStatus.OPEN,
            title=title,
            timezone=timezone,
            executor_id=executor_id,
            workflow_id=workflow_id,
            created_at=now,
            updated_at=now,
        )
        self._threads.add(thread)
        self._events.emit(
            thread,
            PlanningEventType.THREAD_CREATED,
            payload=(("requested_intent", requested_intent.value),),
        )
        return thread

    def get_thread(self, thread_id: ComposerThreadId) -> ComposerThread:
        thread = self._threads.get(thread_id)
        if thread is None:
            raise ComposerThreadNotFoundError(f"Composer thread {thread_id} was not found")
        return thread

    def list_for_project(self, project_id: ProjectId) -> tuple[ComposerThread, ...]:
        self._projects.get_project(project_id)
        return self._threads.list_by_project(project_id)

    def resolve_intent(
        self,
        thread_id: ComposerThreadId,
        *,
        resolved_intent: ComposerIntent,
        reason_summary: str,
        requires_user_action: bool,
    ) -> ComposerThread:
        thread = self.get_thread(thread_id)
        if thread.status is ComposerThreadStatus.ARCHIVED:
            raise PlanningTransitionError("Archived Composer thread is read-only")
        if resolved_intent is ComposerIntent.AUTO:
            raise PlanningTransitionError("Resolved Composer intent must not be AUTO")
        if thread.resolved_intent is not None:
            if thread.resolved_intent is resolved_intent:
                return thread
            raise PlanningTransitionError("Composer intent resolution is immutable once recorded")

        now = utc_now(self._clock)
        resolved = replace(
            thread,
            resolved_intent=resolved_intent,
            status=(
                ComposerThreadStatus.AWAITING_USER
                if requires_user_action
                else ComposerThreadStatus.ACTIVE
            ),
            updated_at=now,
        )
        self._threads.save(resolved)
        self._events.emit(
            resolved,
            PlanningEventType.INTENT_RESOLVED,
            payload=(
                ("resolved_intent", resolved_intent.value),
                ("reason_summary", reason_summary),
                ("requires_user_action", requires_user_action),
            ),
        )
        return resolved

    def resume_after_user_decision(self, thread_id: ComposerThreadId) -> ComposerThread:
        thread = self.get_thread(thread_id)
        if thread.status is not ComposerThreadStatus.AWAITING_USER:
            return thread

        resumed = replace(
            thread,
            status=ComposerThreadStatus.ACTIVE,
            updated_at=utc_now(self._clock),
        )
        self._threads.save(resumed)
        return resumed

    def append_user_message(
        self,
        thread_id: ComposerThreadId,
        *,
        content: str,
    ) -> ComposerMessage:
        return self._append_message(
            thread_id,
            actor_type=ComposerActorType.USER,
            message_kind=ComposerMessageKind.USER_PROMPT,
            content=content,
        )

    def append_role_contribution(
        self,
        thread_id: ComposerThreadId,
        *,
        role_key: str,
        content: str,
    ) -> ComposerMessage:
        return self._append_message(
            thread_id,
            actor_type=ComposerActorType.ROLE,
            message_kind=ComposerMessageKind.ROLE_CONTRIBUTION,
            content=content,
            role_key=role_key,
        )

    def list_messages(self, thread_id: ComposerThreadId) -> tuple[ComposerMessage, ...]:
        self.get_thread(thread_id)
        return self._messages.list_by_thread(thread_id)

    def _append_message(
        self,
        thread_id: ComposerThreadId,
        *,
        actor_type: ComposerActorType,
        message_kind: ComposerMessageKind,
        content: str,
        role_key: str | None = None,
    ) -> ComposerMessage:
        thread = self.get_thread(thread_id)
        if thread.status is ComposerThreadStatus.ARCHIVED:
            raise PlanningTransitionError("Archived Composer thread is read-only")

        message = ComposerMessage(
            id=self._message_id_factory(),
            thread_id=thread.id,
            actor_type=actor_type,
            message_kind=message_kind,
            content=content,
            role_key=role_key,
            created_at=utc_now(self._clock),
        )
        self._messages.append(message)
        event_type = (
            PlanningEventType.CONTRIBUTION_RECORDED
            if actor_type is ComposerActorType.ROLE
            else PlanningEventType.MESSAGE_RECEIVED
        )
        self._events.emit(
            thread,
            event_type,
            role_key=role_key,
            payload=(("message_id", str(message.id)), ("message_kind", message_kind.value)),
        )
        return message


class TeamProposalService:
    def __init__(
        self,
        repository: TeamProposalRepository,
        threads: ComposerThreadService,
        events: PlanningEventService,
        *,
        clock: Clock = utc_now,
        proposal_id_factory: Callable[[], TeamProposalId] = TeamProposalId.new,
    ) -> None:
        self._repository = repository
        self._threads = threads
        self._events = events
        self._clock = clock
        self._proposal_id_factory = proposal_id_factory

    def propose(
        self,
        thread_id: ComposerThreadId,
        *,
        phase: TeamPhase,
        rationale_summary: str,
        members: tuple[tuple[str, TeamMemberDisposition, str], ...],
    ) -> tuple[TeamProposal, tuple[TeamProposalMember, ...]]:
        thread = self._threads.get_thread(thread_id)
        now = utc_now(self._clock)
        proposal = TeamProposal(
            id=self._proposal_id_factory(),
            thread_id=thread.id,
            phase=phase,
            status=TeamProposalStatus.PROPOSED,
            rationale_summary=rationale_summary,
            created_at=now,
        )
        proposal_members = tuple(
            TeamProposalMember(
                proposal_id=proposal.id,
                role_key=role_key,
                disposition=disposition,
                reason=reason,
                order_hint=index,
            )
            for index, (role_key, disposition, reason) in enumerate(members)
        )
        self._repository.add(proposal, proposal_members)
        self._events.emit(
            thread,
            PlanningEventType.TEAM_PROPOSED,
            payload=(("proposal_id", str(proposal.id)), ("phase", phase.value)),
        )
        return proposal, proposal_members

    def list_for_thread(
        self,
        thread_id: ComposerThreadId,
    ) -> tuple[tuple[TeamProposal, tuple[TeamProposalMember, ...]], ...]:
        self._threads.get_thread(thread_id)
        return self._repository.list_by_thread(thread_id)

    def accept(self, proposal_id: TeamProposalId) -> TeamProposal:
        return self._decide(proposal_id, TeamProposalStatus.ACCEPTED)

    def reject(self, proposal_id: TeamProposalId) -> TeamProposal:
        return self._decide(proposal_id, TeamProposalStatus.REJECTED)

    def _decide(
        self,
        proposal_id: TeamProposalId,
        status: TeamProposalStatus,
    ) -> TeamProposal:
        proposal = self._repository.get(proposal_id)
        if proposal is None:
            raise TeamProposalNotFoundError(f"Team proposal {proposal_id} was not found")
        if proposal.status is not TeamProposalStatus.PROPOSED:
            raise PlanningTransitionError("Team proposal decision is immutable once recorded")

        decided = replace(proposal, status=status, decided_at=utc_now(self._clock))
        self._repository.save(decided)
        thread = self._threads.get_thread(proposal.thread_id)
        self._events.emit(
            thread,
            (
                PlanningEventType.TEAM_ACCEPTED
                if status is TeamProposalStatus.ACCEPTED
                else PlanningEventType.TEAM_REJECTED
            ),
            payload=(("proposal_id", str(proposal.id)),),
        )
        return decided


class PlanningArtifactService:
    def __init__(
        self,
        repository: PlanningArtifactRepository,
        threads: ComposerThreadService,
        events: PlanningEventService,
        *,
        clock: Clock = utc_now,
        artifact_id_factory: Callable[[], PlanningArtifactId] = PlanningArtifactId.new,
    ) -> None:
        self._repository = repository
        self._threads = threads
        self._events = events
        self._clock = clock
        self._artifact_id_factory = artifact_id_factory

    def create(
        self,
        thread_id: ComposerThreadId,
        *,
        artifact_type: PlanningArtifactType,
        title: str,
        content: PlanningContent,
        author_role_key: str | None = None,
        status: PlanningArtifactStatus = PlanningArtifactStatus.OPEN,
    ) -> PlanningArtifact:
        thread = self._threads.get_thread(thread_id)
        now = utc_now(self._clock)
        artifact = PlanningArtifact(
            id=self._artifact_id_factory(),
            thread_id=thread.id,
            artifact_type=artifact_type,
            title=title,
            content=build_planning_content(content),
            author_role_key=author_role_key,
            status=status,
            created_at=now,
            updated_at=now,
        )
        self._repository.add(artifact)
        self._events.emit(
            thread,
            PlanningEventType.ARTIFACT_CREATED,
            role_key=author_role_key,
            payload=(
                ("artifact_id", str(artifact.id)),
                ("artifact_type", artifact.artifact_type.value),
            ),
        )
        return artifact

    def get(self, artifact_id: PlanningArtifactId) -> PlanningArtifact:
        artifact = self._repository.get(artifact_id)
        if artifact is None:
            raise PlanningArtifactNotFoundError(
                f"Planning artifact {artifact_id} was not found"
            )
        return artifact

    def resolve_question(
        self,
        artifact_id: PlanningArtifactId,
        *,
        selected_option: str,
        note: str | None = None,
    ) -> tuple[PlanningArtifact, PlanningArtifact]:
        question = self.get(artifact_id)
        if question.artifact_type is not PlanningArtifactType.QUESTION:
            raise PlanningTransitionError("Only QUESTION artifacts can be resolved")
        if question.status is not PlanningArtifactStatus.OPEN:
            raise PlanningTransitionError(
                "Planning question decision is immutable once recorded"
            )

        normalized_option = selected_option.strip()
        content = dict(question.content)
        selected_value = content.get(normalized_option)
        if not normalized_option.startswith("option_") or not isinstance(
            selected_value, str
        ):
            raise PlanningTransitionError(
                "Selected planning option is not declared by this question"
            )

        normalized_note = None if note is None else note.strip()
        now = utc_now(self._clock)
        resolved = replace(
            question,
            status=PlanningArtifactStatus.RESOLVED,
            updated_at=now,
        )

        decision_pairs: list[tuple[str, PlanningValue]] = [
            ("question_artifact_id", str(question.id)),
            ("selected_option", normalized_option),
            ("selected_value", selected_value),
        ]
        recommendation = content.get("recommendation")
        if isinstance(recommendation, str) and recommendation:
            decision_pairs.append(("recommendation", recommendation))
        if normalized_note:
            decision_pairs.append(("note", normalized_note))

        decision = PlanningArtifact(
            id=self._artifact_id_factory(),
            thread_id=question.thread_id,
            artifact_type=PlanningArtifactType.DECISION,
            title=f"Decision · {question.title}"[:240],
            content=build_planning_content(tuple(decision_pairs)),
            author_role_key=None,
            status=PlanningArtifactStatus.RESOLVED,
            created_at=now,
            updated_at=now,
        )

        self._repository.resolve_question(resolved, decision)
        thread = self._threads.get_thread(question.thread_id)

        self._events.emit(
            thread,
            PlanningEventType.ARTIFACT_RESOLVED,
            payload=(
                ("artifact_id", str(question.id)),
                ("decision_artifact_id", str(decision.id)),
                ("selected_option", normalized_option),
            ),
        )
        self._events.emit(
            thread,
            PlanningEventType.ARTIFACT_CREATED,
            payload=(
                ("artifact_id", str(decision.id)),
                ("artifact_type", decision.artifact_type.value),
            ),
        )
        self._audit.record(
            project_id=thread.project_id,
            run_id=None,
            action=AuditAction.PLANNING_DECISION_RECORDED,
            actor_type=AuditActorType.USER,
            target_type=AuditTargetType.PLANNING_ARTIFACT,
            target_id=str(question.id),
            safe_metadata=(("selected_option", normalized_option),),
        )

        open_questions = tuple(
            artifact
            for artifact in self._repository.list_by_thread(thread.id)
            if artifact.artifact_type is PlanningArtifactType.QUESTION
            and artifact.status is PlanningArtifactStatus.OPEN
        )
        if not open_questions:
            self._threads.resume_after_user_decision(thread.id)

        return resolved, decision

    def list_for_thread(self, thread_id: ComposerThreadId) -> tuple[PlanningArtifact, ...]:
        self._threads.get_thread(thread_id)
        return self._repository.list_by_thread(thread_id)


class RequirementService:
    def __init__(
        self,
        repository: RequirementCandidateRepository,
        threads: ComposerThreadService,
        events: PlanningEventService,
        audit: AuditService,
        *,
        clock: Clock = utc_now,
        requirement_id_factory: Callable[[], RequirementCandidateId] = RequirementCandidateId.new,
    ) -> None:
        self._repository = repository
        self._threads = threads
        self._events = events
        self._audit = audit
        self._clock = clock
        self._requirement_id_factory = requirement_id_factory

    def propose(
        self,
        thread_id: ComposerThreadId,
        *,
        title: str,
        problem: str,
        requirement: str,
        rationale: str,
        source_roles: tuple[str, ...] = (),
        acceptance_hint: str | None = None,
    ) -> RequirementCandidate:
        thread = self._threads.get_thread(thread_id)
        now = utc_now(self._clock)
        candidate = RequirementCandidate(
            id=self._requirement_id_factory(),
            thread_id=thread.id,
            project_id=thread.project_id,
            title=title,
            problem=problem,
            requirement=requirement,
            rationale=rationale,
            acceptance_hint=acceptance_hint,
            source_roles=source_roles,
            status=RequirementStatus.PROPOSED,
            created_at=now,
            updated_at=now,
        )
        self._repository.add(candidate)
        self._events.emit(
            thread,
            PlanningEventType.REQUIREMENT_PROPOSED,
            payload=(("requirement_id", str(candidate.id)),),
        )
        return candidate

    def get(self, requirement_id: RequirementCandidateId) -> RequirementCandidate:
        requirement = self._repository.get(requirement_id)
        if requirement is None:
            raise RequirementCandidateNotFoundError(
                f"Requirement candidate {requirement_id} was not found"
            )
        return requirement

    def list_for_thread(
        self,
        thread_id: ComposerThreadId,
    ) -> tuple[RequirementCandidate, ...]:
        self._threads.get_thread(thread_id)
        return self._repository.list_by_thread(thread_id)

    def approve(self, requirement_id: RequirementCandidateId) -> RequirementCandidate:
        return self._decide(requirement_id, RequirementStatus.APPROVED)

    def reject(self, requirement_id: RequirementCandidateId) -> RequirementCandidate:
        return self._decide(requirement_id, RequirementStatus.REJECTED)

    def defer(self, requirement_id: RequirementCandidateId) -> RequirementCandidate:
        return self._decide(requirement_id, RequirementStatus.DEFERRED)

    def _decide(
        self,
        requirement_id: RequirementCandidateId,
        status: RequirementStatus,
    ) -> RequirementCandidate:
        current = self.get(requirement_id)
        try:
            decided = current.decide(status, self._clock())
        except DomainInvariantError as exc:
            raise PlanningTransitionError(str(exc)) from exc

        self._repository.save(decided)
        action_by_status = {
            RequirementStatus.APPROVED: AuditAction.REQUIREMENT_APPROVED,
            RequirementStatus.REJECTED: AuditAction.REQUIREMENT_REJECTED,
            RequirementStatus.DEFERRED: AuditAction.REQUIREMENT_DEFERRED,
        }
        event_by_status = {
            RequirementStatus.APPROVED: PlanningEventType.REQUIREMENT_APPROVED,
            RequirementStatus.REJECTED: PlanningEventType.REQUIREMENT_REJECTED,
            RequirementStatus.DEFERRED: PlanningEventType.REQUIREMENT_DEFERRED,
        }
        self._audit.record(
            project_id=decided.project_id,
            run_id=None,
            action=action_by_status[status],
            actor_type=AuditActorType.USER,
            target_type=AuditTargetType.REQUIREMENT,
            target_id=str(decided.id),
            safe_metadata=(("status", status.value),),
        )
        thread = self._threads.get_thread(decided.thread_id)
        self._events.emit(
            thread,
            event_by_status[status],
            payload=(("requirement_id", str(decided.id)),),
        )
        return decided
