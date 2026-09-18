"""Review application errors."""

from __future__ import annotations

from agent_office.domain import FindingId, FindingReasonCode


class ReviewError(RuntimeError):
    """Base class for review and Finding failures."""


class FindingNotFoundError(ReviewError):
    """Raised when a Finding cannot be found."""


class FindingPersistenceError(ReviewError):
    """Raised when a Finding cannot be persisted safely."""


class FindingNotAcceptableError(ReviewError):
    """Raised when a Finding is not eligible for the requested transition."""


class FindingOwnershipError(ReviewError):
    """Raised when a Finding is referenced outside its owning Run or Project."""


class RemediationOwnershipError(ReviewError):
    """Raised when remediation ownership cannot be established factually.

    The contract defines no fallback: an unidentifiable owner must block rather
    than be guessed.
    """

    def __init__(self, reason_code: FindingReasonCode, summary: str) -> None:
        super().__init__(summary)
        self.reason_code = reason_code
        self.summary = summary


class InvalidFindingError(ReviewError):
    """Raised when a reviewer reported finding facts that are not valid."""


def finding_not_found(finding_id: FindingId) -> FindingNotFoundError:
    return FindingNotFoundError(f"Finding {finding_id} was not found")
