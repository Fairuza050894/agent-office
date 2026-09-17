"""Application ports for append-only AuditRecord persistence."""

from __future__ import annotations

from typing import Protocol

from agent_office.domain import AuditRecord, RunId


class AuditRecordRepository(Protocol):
    """Persistence boundary for AuditRecords.

    The boundary is deliberately append-and-read only. There is no update and no
    delete, so a caller cannot rewrite durable audit history through this port.
    """

    def append(self, record: AuditRecord) -> None:
        """Persist one AuditRecord."""
        ...

    def list_by_run(self, run_id: RunId) -> tuple[AuditRecord, ...]:
        """Return every AuditRecord for a Run in durable order."""
        ...
