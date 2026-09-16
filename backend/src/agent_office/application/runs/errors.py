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
