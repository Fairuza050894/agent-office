"""Provider-neutral workflow definition, snapshot, and condition primitives.

A ``WorkflowDefinition`` is the editable workflow authority. When a Run starts
it is frozen into an immutable ``WorkflowSnapshot`` so that later edits to the
reusable definition cannot change active or historical Run behavior.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum

from agent_office.domain.errors import DomainInvariantError
from agent_office.domain.identifiers import (
    AgentProfileId,
    ProjectId,
    RunId,
    WorkflowDefinitionId,
    WorkflowSnapshotId,
)
from agent_office.domain.timestamps import to_utc

WORKFLOW_SCHEMA_VERSION = 1

SUPPORTED_WORKFLOW_SCHEMA_VERSIONS: frozenset[int] = frozenset({WORKFLOW_SCHEMA_VERSION})


class WorkflowDefinitionStatus(StrEnum):
    """Lifecycle of a reusable WorkflowDefinition."""

    DRAFT = "DRAFT"
    ACTIVE = "ACTIVE"
    ARCHIVED = "ARCHIVED"


class StageKey(StrEnum):
    """Semantic stage identifiers from the Workflow Contract."""

    DISCOVERY = "DISCOVERY"
    PLANNING = "PLANNING"
    IMPLEMENTATION = "IMPLEMENTATION"
    INTEGRATION = "INTEGRATION"
    REVIEW = "REVIEW"
    REMEDIATION = "REMEDIATION"
    VERIFICATION = "VERIFICATION"
    DOCUMENTATION = "DOCUMENTATION"
    FINALIZATION = "FINALIZATION"


class StageExecutionMode(StrEnum):
    """Declared execution mode of one stage.

    ``PARALLEL_ALLOWED`` expresses workflow intent only; it never overrides
    workspace safety.
    """

    SEQUENTIAL = "SEQUENTIAL"
    PARALLEL_ALLOWED = "PARALLEL_ALLOWED"


class StageCondition(StrEnum):
    """Bounded, non-executable stage conditions."""

    ALWAYS = "ALWAYS"
    IF_UI_CHANGED = "IF_UI_CHANGED"


class ConditionOutcome(StrEnum):
    """Result of evaluating a bounded stage condition."""

    TRUE = "TRUE"
    FALSE = "FALSE"
    UNKNOWN = "UNKNOWN"


class AgentAccessMode(StrEnum):
    """Requested execution access mode of an agent assignment."""

    READ_ONLY = "READ_ONLY"
    BOUNDED_WRITE = "BOUNDED_WRITE"
    WRITE = "WRITE"


class ChangeArea(StrEnum):
    """Factual declared change areas used by bounded stage conditions."""

    BACKEND = "BACKEND"
    FRONTEND = "FRONTEND"
    UI = "UI"
    SECURITY = "SECURITY"
    DOCUMENTATION = "DOCUMENTATION"
    OTHER = "OTHER"


@dataclass(frozen=True, slots=True)
class AgentAssignment:
    """One request to execute an AgentProfile within a stage."""

    profile_key: str
    access_mode: AgentAccessMode = AgentAccessMode.READ_ONLY
    required: bool = True

    def __post_init__(self) -> None:
        profile_key = self.profile_key.strip().lower()

        if not profile_key:
            raise DomainInvariantError("Agent assignment profile key must not be empty")

        object.__setattr__(self, "profile_key", profile_key)


@dataclass(frozen=True, slots=True)
class StageDefinition:
    """One immutable stage node inside a workflow graph."""

    key: StageKey
    name: str
    order_hint: int
    assignments: tuple[AgentAssignment, ...]
    depends_on: tuple[StageKey, ...] = ()
    execution_mode: StageExecutionMode = StageExecutionMode.SEQUENTIAL
    required: bool = True
    condition: StageCondition = StageCondition.ALWAYS

    def __post_init__(self) -> None:
        name = self.name.strip()

        if not name:
            raise DomainInvariantError("Stage name must not be empty")

        if self.order_hint < 0:
            raise DomainInvariantError("Stage order hint must not be negative")

        if not self.assignments:
            raise DomainInvariantError("Stage must declare at least one agent assignment")

        if len(set(self.depends_on)) != len(self.depends_on):
            raise DomainInvariantError("Stage dependencies must be unique")

        if self.key in self.depends_on:
            raise DomainInvariantError("Stage must not depend on itself")

        object.__setattr__(self, "name", name)


@dataclass(frozen=True, slots=True)
class FrozenAgentAssignment:
    """Immutable agent-assignment authority frozen into a snapshot.

    The AgentProfile catalog is reusable configuration. Freezing the resolved
    profile identity and version means a later profile revision can never change
    the meaning of an already-started Run.
    """

    stage_key: StageKey
    profile_id: AgentProfileId
    profile_key: str
    profile_name: str
    profile_version: int
    access_mode: AgentAccessMode
    required: bool

    def __post_init__(self) -> None:
        profile_key = self.profile_key.strip().lower()

        if not profile_key:
            raise DomainInvariantError("Frozen agent assignment profile key must not be empty")

        if self.profile_version < 1:
            raise DomainInvariantError("Frozen agent assignment profile version must be at least 1")

        object.__setattr__(self, "profile_key", profile_key)


@dataclass(frozen=True, slots=True)
class WorkflowGraph:
    """A validated, acyclic workflow graph."""

    stages: tuple[StageDefinition, ...]
    schema_version: int = WORKFLOW_SCHEMA_VERSION

    def __post_init__(self) -> None:
        if self.schema_version not in SUPPORTED_WORKFLOW_SCHEMA_VERSIONS:
            raise DomainInvariantError(
                f"Unsupported workflow schema version: {self.schema_version}"
            )

        if not self.stages:
            raise DomainInvariantError("Workflow must declare at least one stage")

        keys = [stage.key for stage in self.stages]

        if len(set(keys)) != len(keys):
            raise DomainInvariantError("Workflow stage keys must be unique")

        known = set(keys)

        for stage in self.stages:
            for dependency in stage.depends_on:
                if dependency not in known:
                    raise DomainInvariantError(
                        f"Stage {stage.key} depends on unknown stage {dependency}"
                    )

        self._ensure_acyclic()

    def _ensure_acyclic(self) -> None:
        """Reject cyclic dependency graphs deterministically."""

        remaining = {stage.key: set(stage.depends_on) for stage in self.stages}
        resolved: set[StageKey] = set()

        while remaining:
            ready = sorted(
                (key for key, deps in remaining.items() if deps <= resolved),
                key=lambda key: key.value,
            )

            if not ready:
                raise DomainInvariantError("Workflow dependency graph must be acyclic")

            for key in ready:
                resolved.add(key)
                del remaining[key]

    def ordered_stages(self) -> tuple[StageDefinition, ...]:
        """Return stages ordered by declared order hint then key."""

        return tuple(sorted(self.stages, key=lambda stage: (stage.order_hint, stage.key.value)))

    def stage(self, key: StageKey) -> StageDefinition | None:
        """Return one stage definition by key."""

        for stage in self.stages:
            if stage.key is key:
                return stage

        return None

    def to_document(self) -> dict[str, object]:
        """Serialize the graph into a bounded, persisted document."""

        return {
            "schema_version": self.schema_version,
            "stages": [
                {
                    "key": stage.key.value,
                    "name": stage.name,
                    "order_hint": stage.order_hint,
                    "execution_mode": stage.execution_mode.value,
                    "required": stage.required,
                    "condition": stage.condition.value,
                    "depends_on": [dependency.value for dependency in stage.depends_on],
                    "assignments": [
                        {
                            "profile_key": assignment.profile_key,
                            "access_mode": assignment.access_mode.value,
                            "required": assignment.required,
                        }
                        for assignment in stage.assignments
                    ],
                }
                for stage in self.ordered_stages()
            ],
        }

    @classmethod
    def from_document(cls, document: object) -> WorkflowGraph:
        """Rebuild a validated graph from a persisted document."""

        if not isinstance(document, dict):
            raise DomainInvariantError("Workflow document must be an object")

        raw_schema_version = document.get("schema_version")

        if not isinstance(raw_schema_version, int):
            raise DomainInvariantError("Workflow document must declare an integer schema version")

        raw_stages = document.get("stages")

        if not isinstance(raw_stages, list):
            raise DomainInvariantError("Workflow document must declare a stage list")

        stages: list[StageDefinition] = []

        for raw_stage in raw_stages:
            stages.append(_stage_from_document(raw_stage))

        return cls(stages=tuple(stages), schema_version=raw_schema_version)


def _stage_from_document(raw_stage: object) -> StageDefinition:
    if not isinstance(raw_stage, dict):
        raise DomainInvariantError("Workflow stage document must be an object")

    raw_key = raw_stage.get("key")
    raw_name = raw_stage.get("name")
    raw_order_hint = raw_stage.get("order_hint")
    raw_assignments = raw_stage.get("assignments")

    if not isinstance(raw_key, str) or not isinstance(raw_name, str):
        raise DomainInvariantError("Workflow stage must declare a key and name")

    if not isinstance(raw_order_hint, int) or isinstance(raw_order_hint, bool):
        raise DomainInvariantError("Workflow stage must declare an integer order hint")

    if not isinstance(raw_assignments, list):
        raise DomainInvariantError("Workflow stage must declare an assignment list")

    try:
        key = StageKey(raw_key)
        execution_mode = StageExecutionMode(_str_of(raw_stage, "execution_mode", "SEQUENTIAL"))
        condition = StageCondition(_str_of(raw_stage, "condition", "ALWAYS"))
        depends_on = tuple(
            _dependency_from_document(value) for value in _list_of(raw_stage, "depends_on")
        )
        assignments = tuple(_assignment_from_document(value) for value in raw_assignments)
    except ValueError as exc:
        raise DomainInvariantError(f"Workflow stage document is invalid: {exc}") from exc

    return StageDefinition(
        key=key,
        name=raw_name,
        order_hint=raw_order_hint,
        assignments=assignments,
        depends_on=depends_on,
        execution_mode=execution_mode,
        required=_bool_of(raw_stage, "required"),
        condition=condition,
    )


def _str_of(document: dict[str, object], key: str, default: str) -> str:
    value = document.get(key, default)

    if not isinstance(value, str):
        raise DomainInvariantError(f"Workflow document field {key} must be a string")

    return value


def _list_of(document: dict[str, object], key: str) -> list[object]:
    value = document.get(key, [])

    if not isinstance(value, list):
        raise DomainInvariantError(f"Workflow document field {key} must be a list")

    return value


def _bool_of(document: dict[str, object], key: str) -> bool:
    value = document.get(key, True)

    if not isinstance(value, bool):
        raise DomainInvariantError(f"Workflow document field {key} must be a boolean")

    return value


def _dependency_from_document(value: object) -> StageKey:
    if not isinstance(value, str):
        raise DomainInvariantError("Workflow dependency must be a stage key string")

    return StageKey(value)


def _assignment_from_document(value: object) -> AgentAssignment:
    if not isinstance(value, dict):
        raise DomainInvariantError("Workflow assignment document must be an object")

    raw_profile_key = value.get("profile_key")

    if not isinstance(raw_profile_key, str):
        raise DomainInvariantError("Workflow assignment must declare a profile key")

    try:
        access_mode = AgentAccessMode(_str_of(value, "access_mode", "READ_ONLY"))
    except ValueError as exc:
        raise DomainInvariantError(f"Workflow assignment access mode is invalid: {exc}") from exc

    return AgentAssignment(
        profile_key=raw_profile_key,
        access_mode=access_mode,
        required=_bool_of(value, "required"),
    )


@dataclass(frozen=True, slots=True)
class WorkflowDefinition:
    """Editable, reusable workflow configuration.

    Editing produces a new revision with an incremented version. Historical
    Runs never depend on the current revision because each Run freezes its own
    ``WorkflowSnapshot``.
    """

    id: WorkflowDefinitionId
    key: str
    name: str
    description: str
    version: int
    status: WorkflowDefinitionStatus
    graph: WorkflowGraph
    created_at: datetime
    updated_at: datetime

    def __post_init__(self) -> None:
        key = self.key.strip().lower()
        name = self.name.strip()

        if not key:
            raise DomainInvariantError("Workflow key must not be empty")

        if not name:
            raise DomainInvariantError("Workflow name must not be empty")

        if self.version < 1:
            raise DomainInvariantError("Workflow version must be at least 1")

        created_at = to_utc(self.created_at)
        updated_at = to_utc(self.updated_at)

        if updated_at < created_at:
            raise DomainInvariantError("WorkflowDefinition updated_at must not precede created_at")

        object.__setattr__(self, "key", key)
        object.__setattr__(self, "name", name)
        object.__setattr__(self, "created_at", created_at)
        object.__setattr__(self, "updated_at", updated_at)

    def revise(
        self,
        *,
        graph: WorkflowGraph,
        name: str | None = None,
        description: str | None = None,
        status: WorkflowDefinitionStatus | None = None,
        updated_at: datetime,
    ) -> WorkflowDefinition:
        """Return the next revision of this definition.

        The revision bump is what makes an edit safe: every already-frozen
        snapshot keeps the version it was created from.
        """

        return WorkflowDefinition(
            id=self.id,
            key=self.key,
            name=self.name if name is None else name,
            description=self.description if description is None else description,
            version=self.version + 1,
            status=self.status if status is None else status,
            graph=graph,
            created_at=self.created_at,
            updated_at=to_utc(updated_at),
        )


@dataclass(frozen=True, slots=True)
class WorkflowSnapshot:
    """Immutable workflow used by exactly one Run.

    The snapshot carries both the frozen graph structure and the resolved agent
    assignment authority, so neither a later WorkflowDefinition edit nor a later
    AgentProfile revision can change this Run's meaning.
    """

    id: WorkflowSnapshotId
    run_id: RunId
    project_id: ProjectId
    source_workflow_id: WorkflowDefinitionId | None
    source_workflow_key: str
    source_workflow_version: int
    graph: WorkflowGraph
    agent_assignments: tuple[FrozenAgentAssignment, ...]
    created_at: datetime

    def __post_init__(self) -> None:
        if not self.source_workflow_key.strip():
            raise DomainInvariantError("Workflow snapshot source key must not be empty")

        if self.source_workflow_version < 1:
            raise DomainInvariantError("Workflow snapshot source version must be at least 1")

        expected = {
            (stage.key, assignment.profile_key)
            for stage in self.graph.stages
            for assignment in stage.assignments
        }
        frozen = {
            (assignment.stage_key, assignment.profile_key) for assignment in self.agent_assignments
        }

        if len(frozen) != len(self.agent_assignments):
            raise DomainInvariantError(
                "Workflow snapshot must freeze exactly one entry per assignment"
            )

        if frozen != expected:
            raise DomainInvariantError(
                "Workflow snapshot frozen assignments must match the workflow graph"
            )

        object.__setattr__(self, "created_at", to_utc(self.created_at))

    def assignments_for(self, stage_key: StageKey) -> tuple[FrozenAgentAssignment, ...]:
        """Return the frozen assignments of one stage in declared order."""

        by_key = {
            assignment.profile_key: assignment
            for assignment in self.agent_assignments
            if assignment.stage_key is stage_key
        }

        stage = self.graph.stage(stage_key)

        if stage is None:
            return ()

        return tuple(
            by_key[assignment.profile_key]
            for assignment in stage.assignments
            if assignment.profile_key in by_key
        )

    def assignment_for(
        self,
        stage_key: StageKey,
        profile_key: str,
    ) -> FrozenAgentAssignment | None:
        """Return one frozen assignment by stage and profile key."""

        normalized = profile_key.strip().lower()

        for assignment in self.agent_assignments:
            if assignment.stage_key is stage_key and assignment.profile_key == normalized:
                return assignment

        return None

    @classmethod
    def freeze(
        cls,
        *,
        snapshot_id: WorkflowSnapshotId,
        run_id: RunId,
        project_id: ProjectId,
        definition: WorkflowDefinition,
        agent_assignments: tuple[FrozenAgentAssignment, ...],
        created_at: datetime,
    ) -> WorkflowSnapshot:
        """Freeze a WorkflowDefinition into an immutable snapshot."""

        return cls(
            id=snapshot_id,
            run_id=run_id,
            project_id=project_id,
            source_workflow_id=definition.id,
            source_workflow_key=definition.key,
            source_workflow_version=definition.version,
            graph=definition.graph,
            agent_assignments=agent_assignments,
            created_at=to_utc(created_at),
        )

    def to_document(self) -> dict[str, object]:
        """Serialize the frozen snapshot into its persisted document."""

        return {
            "graph": self.graph.to_document(),
            "agent_assignments": [
                {
                    "stage_key": assignment.stage_key.value,
                    "profile_id": str(assignment.profile_id),
                    "profile_key": assignment.profile_key,
                    "profile_name": assignment.profile_name,
                    "profile_version": assignment.profile_version,
                    "access_mode": assignment.access_mode.value,
                    "required": assignment.required,
                }
                for assignment in self.agent_assignments
            ],
        }

    @classmethod
    def from_document(
        cls,
        *,
        snapshot_id: WorkflowSnapshotId,
        run_id: RunId,
        project_id: ProjectId,
        source_workflow_id: WorkflowDefinitionId | None,
        source_workflow_key: str,
        source_workflow_version: int,
        document: object,
        created_at: datetime,
    ) -> WorkflowSnapshot:
        """Rebuild a snapshot from its persisted document."""

        if not isinstance(document, dict):
            raise DomainInvariantError("Workflow snapshot document must be an object")

        graph = WorkflowGraph.from_document(document.get("graph"))

        raw_assignments = document.get("agent_assignments")

        if not isinstance(raw_assignments, list):
            raise DomainInvariantError(
                "Workflow snapshot document must declare frozen agent assignments"
            )

        return cls(
            id=snapshot_id,
            run_id=run_id,
            project_id=project_id,
            source_workflow_id=source_workflow_id,
            source_workflow_key=source_workflow_key,
            source_workflow_version=source_workflow_version,
            graph=graph,
            agent_assignments=tuple(
                _frozen_assignment_from_document(value) for value in raw_assignments
            ),
            created_at=created_at,
        )


def _frozen_assignment_from_document(value: object) -> FrozenAgentAssignment:
    if not isinstance(value, dict):
        raise DomainInvariantError("Frozen agent assignment document must be an object")

    raw_stage_key = value.get("stage_key")
    raw_profile_id = value.get("profile_id")
    raw_profile_key = value.get("profile_key")
    raw_profile_name = value.get("profile_name")
    raw_profile_version = value.get("profile_version")

    if not isinstance(raw_stage_key, str) or not isinstance(raw_profile_key, str):
        raise DomainInvariantError(
            "Frozen agent assignment must declare a stage key and profile key"
        )

    if not isinstance(raw_profile_id, str):
        raise DomainInvariantError("Frozen agent assignment must declare a profile identity")

    if not isinstance(raw_profile_name, str):
        raise DomainInvariantError("Frozen agent assignment must declare a profile name")

    if not isinstance(raw_profile_version, int) or isinstance(raw_profile_version, bool):
        raise DomainInvariantError(
            "Frozen agent assignment must declare an integer profile version"
        )

    try:
        stage_key = StageKey(raw_stage_key)
        access_mode = AgentAccessMode(_str_of(value, "access_mode", "READ_ONLY"))
    except ValueError as exc:
        raise DomainInvariantError(f"Frozen agent assignment is invalid: {exc}") from exc

    return FrozenAgentAssignment(
        stage_key=stage_key,
        profile_id=AgentProfileId.parse(raw_profile_id),
        profile_key=raw_profile_key,
        profile_name=raw_profile_name,
        profile_version=raw_profile_version,
        access_mode=access_mode,
        required=_bool_of(value, "required"),
    )


def evaluate_stage_condition(
    condition: StageCondition,
    changed_areas: tuple[ChangeArea, ...] | None,
) -> ConditionOutcome:
    """Evaluate a bounded stage condition from factual declared Run input.

    ``None`` means the factual input was never declared, which is reported as
    ``UNKNOWN`` rather than silently treated as ``FALSE``.
    """

    if condition is StageCondition.ALWAYS:
        return ConditionOutcome.TRUE

    if condition is StageCondition.IF_UI_CHANGED:
        if changed_areas is None:
            return ConditionOutcome.UNKNOWN

        if ChangeArea.UI in changed_areas or ChangeArea.FRONTEND in changed_areas:
            return ConditionOutcome.TRUE

        return ConditionOutcome.FALSE

    return ConditionOutcome.UNKNOWN
