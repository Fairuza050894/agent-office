"""AgentRun application errors."""


class AgentRunError(RuntimeError):
    """Base class for AgentRun application errors."""


class AgentRunNotFoundError(AgentRunError):
    """Raised when an AgentRun does not exist."""


class AgentRunPersistenceError(AgentRunError):
    """Raised when AgentRun state cannot be persisted safely."""


class AgentProfileNotFoundError(AgentRunError):
    """Raised when a workflow assignment references an unknown AgentProfile."""
