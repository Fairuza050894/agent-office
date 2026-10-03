"""Git infrastructure adapters."""

from agent_office.infrastructure.git.repository_inspector import (
    GitRepositoryInspector,
)
from agent_office.infrastructure.git.result_delivery import GitManagedResultDelivery
from agent_office.infrastructure.git.worktree_manager import GitWorktreeManager

__all__ = [
    "GitManagedResultDelivery",
    "GitRepositoryInspector",
    "GitWorktreeManager",
]
