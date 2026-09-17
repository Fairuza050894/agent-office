"""Run application errors."""


class RunServiceError(RuntimeError):
    """Base error for Run operations."""


class RunNotFoundError(RunServiceError):
    """Raised when a requested Run does not exist."""


class ProjectArchivedError(RunServiceError):
    """Raised when a new Run is requested for an archived Project."""


class OwnershipError(RunServiceError):
    """Raised when a cross-Project ownership mismatch is detected."""


class RunPersistenceError(RunServiceError):
    """Raised when Run persistence fails safely."""


class RunStagePersistenceError(RunServiceError):
    """Raised when stage runtime state cannot be persisted safely."""


class RunNotStartableError(RunServiceError):
    """Raised when a Run cannot be started from its current lifecycle state."""


class RunNotCancellableError(RunServiceError):
    """Raised when cancellation is not a valid operation for the current Run."""


class WorkflowResolutionError(RunServiceError):
    """Raised when no usable WorkflowDefinition can be resolved for a Run."""


class RunNotResumableError(RunServiceError):
    """Raised when a Run cannot be resumed because a precondition is unmet."""
