"""Verification and Evidence application errors."""

from __future__ import annotations

from agent_office.domain import CommandRejectionCode, EvidenceId


class VerificationError(RuntimeError):
    """Base class for verification and Evidence failures."""


class EvidenceNotFoundError(VerificationError):
    """Raised when Evidence cannot be found."""


class EvidencePersistenceError(VerificationError):
    """Raised when Evidence cannot be persisted safely."""


class EvidenceOwnershipError(VerificationError):
    """Raised when Evidence is referenced outside its owning Run or Project."""


class CommandRejectedError(VerificationError):
    """Raised when the command policy refuses a verification command.

    The rejection is a policy decision, not a test failure, and is recorded so a
    denied attempt stays auditable.
    """

    def __init__(self, rejection_code: CommandRejectionCode, summary: str) -> None:
        super().__init__(summary)
        self.rejection_code = rejection_code
        self.summary = summary


class VerificationWorkspaceError(VerificationError):
    """Raised when no Workspace may host a verification command.

    Verification never falls back to the Project's main working tree.
    """

    def __init__(self, rejection_code: CommandRejectionCode, summary: str) -> None:
        super().__init__(summary)
        self.rejection_code = rejection_code
        self.summary = summary


def evidence_not_found(evidence_id: EvidenceId) -> EvidenceNotFoundError:
    return EvidenceNotFoundError(f"Evidence {evidence_id} was not found")
