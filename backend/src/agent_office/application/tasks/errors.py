"""Task application errors."""


class TaskServiceError(RuntimeError):
    """Base error for Task operations."""


class TaskNotFoundError(TaskServiceError):
    """Raised when a requested Task does not exist."""


class TaskPersistenceError(TaskServiceError):
    """Raised when Task persistence fails safely."""
