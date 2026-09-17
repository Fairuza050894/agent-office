"""Workflow application service.

Owns reusable WorkflowDefinitions, their append-only version history, the
central validation path, and the freeze operation that turns one definition
version into the immutable WorkflowSnapshot a Run executes against.
"""

from __future__ import annotations

from collections.abc import Callable
from datetime import datetime

from agent_office.application.workflows.builtin import (
    DEFAULT_WORKFLOW_KEY,
    built_in_workflow_definitions,
)
from agent_office.application.workflows.errors import (
    WorkflowKeyConflictError,
    WorkflowNotFoundError,
    WorkflowSnapshotNotFoundError,
    WorkflowVersionNotFoundError,
)
from agent_office.application.workflows.ports import (
    WorkflowDefinitionRepository,
    WorkflowSnapshotRepository,
)
from agent_office.domain import (
    AgentProfileCatalog,
    DomainInvariantError,
    FrozenAgentAssignment,
    ProjectId,
    RunId,
    WorkflowDefinition,
    WorkflowDefinitionId,
    WorkflowDefinitionStatus,
    WorkflowGraph,
    WorkflowSnapshot,
    WorkflowSnapshotId,
    WorkflowValidationReport,
    utc_now,
    validate_workflow_graph,
)

Clock = Callable[[], datetime]

DefinitionIdFactory = Callable[[], WorkflowDefinitionId]

SnapshotIdFactory = Callable[[], WorkflowSnapshotId]


class WorkflowService:
    """Coordinates WorkflowDefinition lifecycle, validation, and freezing."""

    def __init__(
        self,
        definition_repository: WorkflowDefinitionRepository,
        snapshot_repository: WorkflowSnapshotRepository,
        *,
        agent_profiles: AgentProfileCatalog | None = None,
        clock: Clock = utc_now,
        definition_id_factory: DefinitionIdFactory = WorkflowDefinitionId.new,
        snapshot_id_factory: SnapshotIdFactory = WorkflowSnapshotId.new,
    ) -> None:
        self._definitions = definition_repository
        self._snapshots = snapshot_repository
        self._agent_profiles = agent_profiles or AgentProfileCatalog()
        self._clock = clock
        self._definition_id_factory = definition_id_factory
        self._snapshot_id_factory = snapshot_id_factory

    @property
    def agent_profiles(self) -> AgentProfileCatalog:
        """Return the AgentProfile catalog used for validation and freezing."""

        return self._agent_profiles

    # ------------------------------------------------------------------
    # Validation
    # ------------------------------------------------------------------

    def validate_graph(self, graph: WorkflowGraph) -> WorkflowValidationReport:
        """Validate a workflow graph through the single central path."""

        return validate_workflow_graph(graph, known_profile_keys=self._agent_profiles.keys())

    def validate_definition(
        self,
        workflow_id: WorkflowDefinitionId,
    ) -> WorkflowValidationReport:
        """Validate a stored WorkflowDefinition at its latest version."""

        return self.validate_graph(self.get_definition(workflow_id).graph)

    # ------------------------------------------------------------------
    # Built-ins
    # ------------------------------------------------------------------

    def ensure_built_in_definitions(self) -> None:
        """Idempotently register the built-in workflow definitions."""

        now = utc_now(self._clock)

        for definition in built_in_workflow_definitions(now):
            if self._definitions.get_by_key(definition.key) is not None:
                continue

            self.validate_graph(definition.graph).require_valid()

            try:
                self._definitions.add(definition)
            except WorkflowKeyConflictError:
                # A concurrent initializer registered the same built-in first.
                continue

    # ------------------------------------------------------------------
    # Definition lifecycle
    # ------------------------------------------------------------------

    def create_definition(
        self,
        *,
        key: str,
        name: str,
        description: str,
        graph: WorkflowGraph,
        status: WorkflowDefinitionStatus = WorkflowDefinitionStatus.ACTIVE,
    ) -> WorkflowDefinition:
        """Create a new reusable WorkflowDefinition at version 1."""

        self.validate_graph(graph).require_valid()

        now = utc_now(self._clock)

        definition = WorkflowDefinition(
            id=self._definition_id_factory(),
            key=key,
            name=name,
            description=description,
            version=1,
            status=status,
            graph=graph,
            created_at=now,
            updated_at=now,
        )

        self._definitions.add(definition)
        return definition

    def revise_definition(
        self,
        workflow_id: WorkflowDefinitionId,
        *,
        graph: WorkflowGraph,
        name: str | None = None,
        description: str | None = None,
        status: WorkflowDefinitionStatus | None = None,
    ) -> WorkflowDefinition:
        """Append a new version of a WorkflowDefinition.

        The previous version row is never rewritten, so every Run snapshot keeps
        referring to exactly the version it was frozen from.
        """

        self.validate_graph(graph).require_valid()

        existing = self.get_definition(workflow_id)

        revised = existing.revise(
            graph=graph,
            name=name,
            description=description,
            status=status,
            updated_at=utc_now(self._clock),
        )

        self._definitions.add_version(revised)
        return revised

    def get_definition(self, workflow_id: WorkflowDefinitionId) -> WorkflowDefinition:
        """Return the latest version of a WorkflowDefinition."""

        definition = self._definitions.get(workflow_id)

        if definition is None:
            raise WorkflowNotFoundError(f"WorkflowDefinition {workflow_id} was not found")

        return definition

    def get_definition_version(
        self,
        workflow_id: WorkflowDefinitionId,
        version: int,
    ) -> WorkflowDefinition:
        """Return one specific historical version of a WorkflowDefinition."""

        definition = self._definitions.get_version(workflow_id, version)

        if definition is None:
            raise WorkflowVersionNotFoundError(
                f"WorkflowDefinition {workflow_id} has no version {version}"
            )

        return definition

    def list_definition_versions(
        self,
        workflow_id: WorkflowDefinitionId,
    ) -> tuple[WorkflowDefinition, ...]:
        """Return every version of a WorkflowDefinition, oldest first."""

        self.get_definition(workflow_id)
        return self._definitions.list_versions(workflow_id)

    def get_definition_by_key(self, key: str) -> WorkflowDefinition | None:
        """Return the latest version of a WorkflowDefinition by stable key."""

        return self._definitions.get_by_key(key)

    def list_definitions(self) -> tuple[WorkflowDefinition, ...]:
        """Return the latest version of every WorkflowDefinition."""

        return self._definitions.list()

    def resolve_definition(
        self,
        *,
        requested_workflow_id: WorkflowDefinitionId | None,
        project_default_workflow_id: WorkflowDefinitionId | None,
    ) -> WorkflowDefinition:
        """Resolve the WorkflowDefinition a Run should execute.

        Resolution order is deterministic and documented: the Task request wins,
        then the Project default, then the built-in default workflow.
        """

        if requested_workflow_id is not None:
            return self.get_definition(requested_workflow_id)

        if project_default_workflow_id is not None:
            return self.get_definition(project_default_workflow_id)

        self.ensure_built_in_definitions()
        default = self.get_definition_by_key(DEFAULT_WORKFLOW_KEY)

        if default is None:
            raise WorkflowNotFoundError(
                f"Default workflow {DEFAULT_WORKFLOW_KEY} is not registered"
            )

        return default

    # ------------------------------------------------------------------
    # Freezing
    # ------------------------------------------------------------------

    def freeze_snapshot(
        self,
        *,
        run_id: RunId,
        project_id: ProjectId,
        definition: WorkflowDefinition,
    ) -> WorkflowSnapshot:
        """Freeze a definition into the immutable snapshot for one Run.

        Every assignment is resolved against the AgentProfile catalog here and
        the resolved profile identity and version are frozen into the snapshot.
        Later profile revisions therefore cannot change this Run's meaning.
        """

        self.validate_graph(definition.graph).require_valid()

        snapshot = WorkflowSnapshot.freeze(
            snapshot_id=self._snapshot_id_factory(),
            run_id=run_id,
            project_id=project_id,
            definition=definition,
            agent_assignments=_freeze_assignments(definition.graph, self._agent_profiles),
            created_at=utc_now(self._clock),
        )

        self._snapshots.add(snapshot)
        return snapshot

    def get_snapshot(self, run_id: RunId) -> WorkflowSnapshot:
        """Return the frozen WorkflowSnapshot of a Run."""

        snapshot = self._snapshots.get_by_run(run_id)

        if snapshot is None:
            raise WorkflowSnapshotNotFoundError(f"Run {run_id} has no workflow snapshot")

        return snapshot

    def find_snapshot(self, run_id: RunId) -> WorkflowSnapshot | None:
        """Return the frozen WorkflowSnapshot of a Run when one exists."""

        return self._snapshots.get_by_run(run_id)


def _freeze_assignments(
    graph: WorkflowGraph,
    catalog: AgentProfileCatalog,
) -> tuple[FrozenAgentAssignment, ...]:
    """Resolve every graph assignment against the profile catalog.

    Central validation has already rejected unknown profile references, so a
    missing profile here is a defensive invariant failure rather than a silent
    omission.
    """

    frozen: list[FrozenAgentAssignment] = []

    for stage in graph.ordered_stages():
        for assignment in stage.assignments:
            profile = catalog.get(assignment.profile_key)

            if profile is None:
                raise DomainInvariantError(
                    f"Agent profile {assignment.profile_key} is not registered"
                )

            frozen.append(
                FrozenAgentAssignment(
                    stage_key=stage.key,
                    profile_id=profile.id,
                    profile_key=profile.key,
                    profile_name=profile.name,
                    profile_version=profile.version,
                    access_mode=assignment.access_mode,
                    required=assignment.required,
                )
            )

    return tuple(frozen)
