"""Audit application errors."""

from __future__ import annotations


class AuditError(RuntimeError):
    """Base class for audit failures."""


class AuditPersistenceError(AuditError):
    """Raised when an AuditRecord cannot be persisted safely."""
