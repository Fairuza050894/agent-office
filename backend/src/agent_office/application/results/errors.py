"""Errors for the human result-review and delivery boundary."""


class ResultReviewError(RuntimeError):
    """Base class for bounded result-review failures."""


class ResultNotReviewableError(ResultReviewError):
    """Raised when a Run has not reached a reviewable technical result."""


class ResultAlreadyDecidedError(ResultReviewError):
    """Raised when an incompatible human result decision already exists."""


class ResultDeliveryError(ResultReviewError):
    """Raised when an approved candidate cannot be delivered safely."""
