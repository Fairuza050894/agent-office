"""Workflow application errors."""


class WorkflowError(RuntimeError):
    """Base class for workflow application errors."""


class WorkflowNotFoundError(WorkflowError):
    """Raised when a WorkflowDefinition does not exist."""


class WorkflowKeyConflictError(WorkflowError):
    """Raised when a workflow key is already registered."""


class WorkflowSnapshotNotFoundError(WorkflowError):
    """Raised when a Run has no frozen WorkflowSnapshot."""


class WorkflowVersionNotFoundError(WorkflowError):
    """Raised when a WorkflowDefinition version does not exist."""


class WorkflowPersistenceError(WorkflowError):
    """Raised when workflow state cannot be persisted safely."""
