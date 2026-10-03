"""Ports for human result review and managed local delivery."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

from agent_office.domain import Workspace


@dataclass(frozen=True, slots=True)
class ManagedDeliveryReceipt:
    """Factual local Git result after accepted delivery."""

    branch: str
    commit: str


class ManagedResultDelivery(Protocol):
    """Commit an accepted candidate in its managed worktree without pushing."""

    def deliver(
        self,
        workspace: Workspace,
        *,
        accepted_branch: str,
        commit_message: str,
    ) -> ManagedDeliveryReceipt:
        """Commit the verified candidate and return the managed branch/commit."""
        ...
