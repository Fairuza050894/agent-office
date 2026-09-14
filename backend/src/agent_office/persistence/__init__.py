"""Agent Office persistence foundation."""

from agent_office.persistence.sqlite import (
    LATEST_SCHEMA_VERSION,
    DatabaseVersionError,
    SQLiteDatabase,
)

__all__ = [
    "DatabaseVersionError",
    "LATEST_SCHEMA_VERSION",
    "SQLiteDatabase",
]
