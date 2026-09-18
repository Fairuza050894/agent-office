"""Review coordination: canonical Finding creation, ownership, and resolution.

The application layer — never the executor adapter — owns whether a Finding
exists, what it means, and when it stops being open. Three rules are enforced
here rather than by convention:

* a reviewer that reports a blocker has NOT failed: its AgentRun stays COMPLETED
  and the Finding is the durable observation it produced;
* a remediation AgentRun completing does NOT resolve a Finding — only a factual
  re-review, or an explicit human risk acceptance, does;
* remediation ownership is derived from durable history, and an owner that
  cannot be established blocks rather than being guessed.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import replace
from datetime import datetime

from agent_office.application.agents.service import AgentRunService
from agent_office.application.audit import AuditService
from agent_office.application.events import EventService
from agent_office.application.review.errors import (
    FindingNotAcceptableError,
    FindingOwnershipError,
    InvalidFindingError,
    RemediationOwnershipError,
    finding_not_found,
)
from agent_office.application.review.ports import FindingRepository
from agent_office.application.runs.service import RunService
from agent_office.application.workflows.service import WorkflowService
from agent_office.domain import (
    AgentAccessMode,
    AgentRun,
    AuditAction,
    AuditActorType,
    AuditTargetType,
    EventSource,
    EventType,
    Finding,
    FindingCategory,
    FindingId,
    FindingReasonCode,
    FindingResolutionType,
    FindingStatus,
    ReportedFinding,
    Run,
    RunId,
    SafeMetadata,
    StageKey,
    ensure_finding_transition_allowed,
    finding_dedupe_key,
    finding_identity_key,
    is_terminal_finding_status,
    utc_now,
)

Clock = Callable[[], datetime]

FindingIdFactory = Callable[[], FindingId]


class FindingService:
    """Create, own, resolve, and accept Findings."""

    def __init__(
        self,
        repository: FindingRepository,
        *,
        run_service: RunService,
        agent_run_service: AgentRunService,
        workflow_service: WorkflowService,
        event_service: EventService,
        audit_service: AuditService,
        clock: Clock = utc_now,
        finding_id_factory: FindingIdFactory = FindingId.new,
    ) -> None:
        self._repository = repository
        self._runs = run_service
        self._agent_runs = agent_run_service
        self._workflows = workflow_service
        self._events = event_service
        self._audit = audit_service
        self._clock = clock
        self._finding_id_factory = finding_id_factory

    # ------------------------------------------------------------------
    # Queries
    # ------------------------------------------------------------------

    def get(self, finding_id: FindingId) -> Finding:
        """Return a Finding by ID."""

        finding = self._repository.get(finding_id)

        if finding is None:
            raise finding_not_found(finding_id)

        return finding

    def list_for_run(self, run_id: RunId) -> tuple[Finding, ...]:
        """Return every Finding of a Run."""

        self._runs.get_run(run_id)

        return self._repository.list_by_run(run_id)

    def list_open_for_run(self, run_id: RunId) -> tuple[Finding, ...]:
        """Return every unresolved Finding of a Run."""

        return self._repository.list_open_by_run(run_id)

    def blocking_findings(self, run_id: RunId) -> tuple[Finding, ...]:
        """Return the unresolved BLOCKER Findings of a Run.

        WORKFLOW_CONTRACT §35: only BLOCKER severity blocks completion by default.
        """

        return tuple(
            finding
            for finding in self._repository.list_open_by_run(run_id)
            if finding.blocks_completion
        )

    # ------------------------------------------------------------------
    # Creation
    # ------------------------------------------------------------------

    def record_review_findings(
        self,
        run: Run,
        reviewer: AgentRun,
        reported: tuple[ReportedFinding, ...],
    ) -> tuple[Finding, ...]:
        """Create canonical Findings from a completed reviewer's report.

        Idempotent per delivery identity: the same reviewer reporting the same
        observation twice produces one durable Finding. The reviewer AgentRun is
        COMPLETED either way; reporting a blocker is not an operational failure.
        """

        if reviewer.run_id != run.id or reviewer.project_id != run.project_id:
            raise FindingOwnershipError(
                "Findings may only be recorded for a reviewer of the same Run and Project."
            )

        if reviewer.stage_key is not StageKey.REVIEW:
            raise FindingOwnershipError("Only a review assignment may report Findings.")

        created: list[Finding] = []

        for reported_finding in reported:
            finding = self._record_one(run, reviewer, reported_finding)

            if finding is not None:
                created.append(finding)

        return tuple(created)

    def _record_one(
        self,
        run: Run,
        reviewer: AgentRun,
        reported: ReportedFinding,
    ) -> Finding | None:
        identity_key = finding_identity_key(
            run_id=run.id,
            severity=reported.severity,
            category=reported.category,
            title=reported.title,
            location=reported.location,
        )
        dedupe_key = finding_dedupe_key(identity_key, reviewer.id)

        existing = self._repository.find_by_dedupe_key(dedupe_key)

        if existing is not None:
            # The same reviewer reported the same observation again. One logical
            # Finding, one workflow effect.
            return None

        now = utc_now(self._clock)

        try:
            finding = Finding(
                id=self._finding_id_factory(),
                project_id=run.project_id,
                run_id=run.id,
                reviewer_agent_run_id=reviewer.id,
                category=reported.category,
                severity=reported.severity,
                title=reported.title,
                description=reported.description,
                status=FindingStatus.OPEN,
                identity_key=identity_key,
                dedupe_key=dedupe_key,
                location=reported.location,
                created_at=now,
                updated_at=now,
            )
        except Exception as exc:  # noqa: BLE001 - reported facts are untrusted input
            raise InvalidFindingError(
                "A reported finding was not valid and was not recorded."
            ) from exc

        if not self._repository.add(finding):
            return None

        self._events.emit(
            run,
            EventType.REVIEW_FINDING_CREATED,
            source=EventSource.REVIEW,
            agent_run_id=reviewer.id,
            payload=(
                ("finding_id", str(finding.id)),
                ("severity", finding.severity.value),
                ("category", finding.category.value),
                ("title", finding.title),
            ),
        )

        return finding

    # ------------------------------------------------------------------
    # Remediation ownership
    # ------------------------------------------------------------------

    def assign_remediation_owner(self, run: Run, finding: Finding) -> Finding:
        """Attribute a Finding to the implementation owner that must fix it.

        Ownership is derived from durable history: the write-capable AgentRun of
        the same stage that produced the work under review. A reviewer never
        becomes the remediation owner. When no owner can be established the
        Finding is not guessed at — the caller blocks instead.
        """

        if finding.run_id != run.id:
            raise FindingOwnershipError("A Finding may only be owned within its own Run.")

        if is_terminal_finding_status(finding.status):
            return finding

        owner = self._implementation_owner(run, finding)

        if owner is None:
            raise RemediationOwnershipError(
                FindingReasonCode.REMEDIATION_OWNER_UNKNOWN,
                "No implementation owner could be established for this Finding, so "
                "remediation was not assigned.",
            )

        if finding.remediation_owner_agent_run_id == owner.id:
            return finding

        updated = replace(
            finding,
            remediation_owner_agent_run_id=owner.id,
            updated_at=utc_now(self._clock),
        )

        self._repository.update(updated)
        return updated

    def _implementation_owner(self, run: Run, finding: Finding) -> AgentRun | None:
        """Return the write-capable AgentRun responsible for the reviewed work.

        Ownership is derived from durable history, never from the reviewer. A
        reviewer never becomes the remediation owner.

        The *required* write-capable implementation assignment is the owner. An
        optional implementation assignment is not treated as the owner, which
        keeps attribution unambiguous without grouping or optimization. When
        several required owners exist, only a category or location that
        positively names one resolves it; otherwise ownership is unknown and the
        caller blocks rather than guessing.
        """

        candidates = [
            agent_run
            for agent_run in self._agent_runs.list_for_run(run.id)
            if agent_run.stage_key is StageKey.IMPLEMENTATION
            and agent_run.access_mode in {AgentAccessMode.BOUNDED_WRITE, AgentAccessMode.WRITE}
            and agent_run.attempt == 1
        ]

        if not candidates:
            return None

        required_keys = self._required_implementation_keys(run)

        required = [
            candidate for candidate in candidates if candidate.agent_profile_key in required_keys
        ]

        pool = required or candidates

        if len(pool) == 1:
            return pool[0]

        profile_keys = {candidate.agent_profile_key for candidate in pool}
        named = _profile_key_for_location(finding) or _profile_key_for_category(finding.category)

        if named is not None and named in profile_keys:
            return next(candidate for candidate in pool if candidate.agent_profile_key == named)

        return None

    def _required_implementation_keys(self, run: Run) -> frozenset[str]:
        """Return the required AgentProfile keys of the Run's implementation stage."""

        snapshot = self._workflows.find_snapshot(run.id)

        if snapshot is None:
            return frozenset()

        stage = snapshot.graph.stage(StageKey.IMPLEMENTATION)

        if stage is None:
            return frozenset()

        return frozenset(
            assignment.profile_key for assignment in stage.assignments if assignment.required
        )

    # ------------------------------------------------------------------
    # Resolution by re-review
    # ------------------------------------------------------------------

    def reconcile_after_review(
        self,
        run: Run,
        reviewers: tuple[AgentRun, ...],
    ) -> tuple[Finding, ...]:
        """Resolve Findings that a re-review no longer reports.

        The reported set is derived from durable state: the Findings this cycle's
        reviewers actually raised. A Finding is resolved only because a factual
        re-review did not report it again — never because remediation ran, and
        never because an implementation agent claimed it was fixed.
        """

        if not reviewers:
            return ()

        for reviewer in reviewers:
            if reviewer.run_id != run.id or reviewer.project_id != run.project_id:
                raise FindingOwnershipError(
                    "Findings may only be reconciled for reviewers of the same Run."
                )

        reviewer_ids = {reviewer.id for reviewer in reviewers}
        all_findings = self._repository.list_by_run(run.id)

        reported_keys = {
            finding.identity_key
            for finding in all_findings
            if finding.reviewer_agent_run_id in reviewer_ids
        }

        resolver = reviewers[0]
        resolved: list[Finding] = []

        for finding in all_findings:
            if not finding.is_open:
                continue

            if finding.reviewer_agent_run_id in reviewer_ids:
                # Raised by this very review pass, so this pass cannot also be
                # what clears it.
                continue

            if finding.identity_key in reported_keys:
                # The observation is still present, so it stays open.
                continue

            resolved.append(
                self._resolve(
                    run,
                    finding,
                    resolver=resolver,
                    resolution_type=FindingResolutionType.REMEDIATED,
                    summary=("A re-review of the same Run no longer reports this observation."),
                )
            )

        return tuple(resolved)

    def _resolve(
        self,
        run: Run,
        finding: Finding,
        *,
        resolver: AgentRun | None,
        resolution_type: FindingResolutionType,
        summary: str,
    ) -> Finding:
        ensure_finding_transition_allowed(finding.status, FindingStatus.RESOLVED)

        now = utc_now(self._clock)

        resolved = replace(
            finding,
            status=FindingStatus.RESOLVED,
            resolution_type=resolution_type,
            resolver_agent_run_id=None if resolver is None else resolver.id,
            resolution_summary=summary,
            resolved_at=now,
            updated_at=now,
        )

        self._repository.update(resolved)

        self._events.emit(
            run,
            EventType.REVIEW_FINDING_RESOLVED,
            source=EventSource.REVIEW,
            agent_run_id=None if resolver is None else resolver.id,
            payload=self._resolution_payload(resolved),
        )

        return resolved

    # ------------------------------------------------------------------
    # Accepted risk
    # ------------------------------------------------------------------

    def accept_risk(
        self,
        finding_id: FindingId,
        *,
        reason: str,
        actor_type: AuditActorType = AuditActorType.USER,
    ) -> Finding:
        """Accept the risk of an unresolved Finding (WORKFLOW_CONTRACT §56).

        Only an attributable human control-plane action may do this. An executor
        or agent can never reach this path, and the refusal is structural: this
        method is only reachable from an operator route.
        """

        finding = self.get(finding_id)
        run = self._runs.get_run(finding.run_id)

        if is_terminal_finding_status(finding.status):
            raise FindingNotAcceptableError(
                f"A Finding in state {finding.status} cannot be accepted again."
            )

        if actor_type is not AuditActorType.USER:
            raise FindingNotAcceptableError(
                "Only an attributable user action may accept risk; an executor or agent "
                "must never self-approve."
            )

        summary = reason.strip()

        if not summary:
            raise FindingNotAcceptableError("Accepting risk requires a recorded reason.")

        ensure_finding_transition_allowed(finding.status, FindingStatus.ACCEPTED_RISK)

        now = utc_now(self._clock)

        accepted = replace(
            finding,
            status=FindingStatus.ACCEPTED_RISK,
            resolution_type=FindingResolutionType.ACCEPTED_RISK,
            resolution_summary=summary,
            resolved_at=now,
            updated_at=now,
        )

        self._repository.update(accepted)

        # DOMAIN_MODEL §29.5: accepted risk requires an attributable actor and a
        # reason. The AuditRecord is that attribution.
        self._audit.record_finding_intervention(
            accepted,
            AuditAction.FINDING_ACCEPTED_RISK,
            actor_type=AuditActorType.USER,
            target_type=AuditTargetType.FINDING,
            # The record names the actor and the Finding; the operator's reason
            # is the Finding's own resolution summary, so it is not duplicated
            # into the audit metadata.
            safe_metadata=(),
        )

        self._events.emit(
            run,
            EventType.REVIEW_FINDING_ACCEPTED_RISK,
            source=EventSource.USER,
            payload=(
                ("finding_id", str(accepted.id)),
                ("severity", accepted.severity.value),
                ("category", accepted.category.value),
            ),
        )

        self._events.emit(
            run,
            EventType.REVIEW_FINDING_RESOLVED,
            source=EventSource.USER,
            payload=self._resolution_payload(accepted),
        )

        return accepted

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    def mark_remediating(self, run: Run, finding: Finding) -> Finding:
        """Record that remediation has begun for a Finding."""

        if finding.status is FindingStatus.REMEDIATING:
            return finding

        ensure_finding_transition_allowed(finding.status, FindingStatus.REMEDIATING)

        updated = replace(
            finding,
            status=FindingStatus.REMEDIATING,
            updated_at=utc_now(self._clock),
        )

        self._repository.update(updated)

        self._events.emit(
            run,
            EventType.REVIEW_FINDING_REMEDIATING,
            source=EventSource.ORCHESTRATOR,
            agent_run_id=updated.remediation_owner_agent_run_id,
            payload=(
                ("finding_id", str(updated.id)),
                ("severity", updated.severity.value),
            ),
        )

        return updated

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _resolution_payload(finding: Finding) -> SafeMetadata:
        resolution = finding.resolution_type

        if resolution is None:
            # Unreachable for a resolved Finding: the domain requires one.
            raise InvalidFindingError("A resolved Finding must record a resolution type.")

        payload: SafeMetadata = (
            ("finding_id", str(finding.id)),
            ("resolution_type", resolution.value),
        )

        if finding.resolver_agent_run_id is not None:
            payload = payload + (("resolver_agent_run_id", str(finding.resolver_agent_run_id)),)

        return payload


#: Repository path prefixes that name a specific implementation surface.
_LOCATION_OWNER_PREFIXES: tuple[tuple[str, str], ...] = (
    ("frontend/", "frontend-developer"),
    ("web/", "frontend-developer"),
    ("ui/", "frontend-developer"),
    ("docs/", "documentation-writer"),
    ("backend/", "backend-developer"),
    ("src/", "backend-developer"),
)


def _profile_key_for_location(finding: Finding) -> str | None:
    """Return the implementation profile a Finding's location names, if any."""

    if finding.location is None or finding.location.repository_relative_path is None:
        return None

    path = finding.location.repository_relative_path.lower()

    for prefix, profile_key in _LOCATION_OWNER_PREFIXES:
        if path.startswith(prefix):
            return profile_key

    return None


def _profile_key_for_category(category: FindingCategory) -> str | None:
    """Return the implementation profile a category belongs to, when it does.

    Only categories that name a specific implementation surface can resolve an
    ambiguous owner. Everything else stays unassigned rather than being guessed.
    """

    if category is FindingCategory.DOCUMENTATION:
        return "documentation-writer"

    return None
