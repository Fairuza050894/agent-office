"""Project Registry application errors."""


class ProjectRegistryError(RuntimeError):
    """Base error for Project Registry operations."""


class InvalidRepositoryError(ProjectRegistryError):
    """Raised when a path cannot be validated as a supported Git repository."""


class DuplicateProjectError(ProjectRegistryError):
    """Raised when the same repository is already registered."""


class ProjectNotFoundError(ProjectRegistryError):
    """Raised when a requested Project does not exist."""
