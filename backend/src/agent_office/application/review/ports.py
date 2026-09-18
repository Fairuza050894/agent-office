"""Review application ports."""

from __future__ import annotations

from typing import Protocol

from agent_office.domain import Finding, FindingId, RunId


class FindingRepository(Protocol):
    """Persistence boundary for Findings.

    The boundary has no delete, because a Finding is never silently removed.
    """

    def add(self, finding: Finding) -> bool:
        """Persist a Finding, returning False when its identity is already known."""
        ...

    def update(self, finding: Finding) -> None:
        """Persist the lifecycle state of an existing Finding."""
        ...

    def get(self, finding_id: FindingId) -> Finding | None:
        """Return a Finding by ID."""
        ...

    def find_by_dedupe_key(self, dedupe_key: str) -> Finding | None:
        """Return the Finding already recorded for a delivery identity."""
        ...

    def list_by_run(self, run_id: RunId) -> tuple[Finding, ...]:
        """Return every Finding of a Run in durable order."""
        ...

    def list_open_by_run(self, run_id: RunId) -> tuple[Finding, ...]:
        """Return every unresolved Finding of a Run."""
        ...
