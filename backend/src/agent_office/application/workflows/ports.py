"""Application ports for workflow management."""

from __future__ import annotations

from typing import Protocol

from agent_office.domain import (
    RunId,
    WorkflowDefinition,
    WorkflowDefinitionId,
    WorkflowSnapshot,
)


class WorkflowDefinitionRepository(Protocol):
    """Persistence boundary for reusable WorkflowDefinitions.

    Definitions are append-only by version: a revision adds a new immutable
    version row and never rewrites a version that a Run may already reference.
    """

    def add(self, definition: WorkflowDefinition) -> None:
        """Persist a new WorkflowDefinition identity with version 1."""
        ...

    def add_version(self, definition: WorkflowDefinition) -> None:
        """Persist a new immutable version of an existing WorkflowDefinition."""
        ...

    def get(self, workflow_id: WorkflowDefinitionId) -> WorkflowDefinition | None:
        """Return the latest version of a WorkflowDefinition."""
        ...

    def get_by_key(self, key: str) -> WorkflowDefinition | None:
        """Return the latest version of a WorkflowDefinition by stable key."""
        ...

    def get_version(
        self,
        workflow_id: WorkflowDefinitionId,
        version: int,
    ) -> WorkflowDefinition | None:
        """Return one specific historical version of a WorkflowDefinition."""
        ...

    def list(self) -> tuple[WorkflowDefinition, ...]:
        """Return the latest version of every WorkflowDefinition by key."""
        ...

    def list_versions(self, workflow_id: WorkflowDefinitionId) -> tuple[WorkflowDefinition, ...]:
        """Return every version of one WorkflowDefinition, oldest first."""
        ...


class WorkflowSnapshotRepository(Protocol):
    """Persistence boundary for immutable WorkflowSnapshots."""

    def add(self, snapshot: WorkflowSnapshot) -> None:
        """Persist a frozen WorkflowSnapshot."""
        ...

    def get_by_run(self, run_id: RunId) -> WorkflowSnapshot | None:
        """Return the WorkflowSnapshot frozen for one Run."""
        ...
