"""Verification application ports."""

from __future__ import annotations

from pathlib import Path
from typing import Protocol

from agent_office.domain import (
    CommandOutcome,
    Evidence,
    EvidenceId,
    EvidenceKind,
    RunId,
    VerificationCheckDefinition,
)


class EvidenceRepository(Protocol):
    """Persistence boundary for Evidence.

    Append and read only. There is no update and no delete, because a rerun
    creates new Evidence rather than rewriting history.
    """

    def append(self, evidence: Evidence) -> None:
        """Persist one Evidence record."""
        ...

    def get(self, evidence_id: EvidenceId) -> Evidence | None:
        """Return Evidence by ID."""
        ...

    def list_by_run(self, run_id: RunId) -> tuple[Evidence, ...]:
        """Return every Evidence record of a Run in durable order."""
        ...

    def list_by_run_and_kind(self, run_id: RunId, kind: EvidenceKind) -> tuple[Evidence, ...]:
        """Return the Evidence of one Run and kind in durable order."""
        ...


class CommandExecutor(Protocol):
    """The bounded command boundary.

    An implementation executes a structured check definition inside a working
    directory it is given. It never decides whether execution is permitted, and
    it never resolves the working directory itself.
    """

    def run(
        self,
        definition: VerificationCheckDefinition,
        *,
        working_directory: Path,
    ) -> CommandOutcome:
        """Execute a check definition and return its factual outcome."""
        ...
