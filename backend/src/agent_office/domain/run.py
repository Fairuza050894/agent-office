"""Run lifecycle primitives."""

from enum import StrEnum

from agent_office.domain.errors import DomainInvariantError


class RunStatus(StrEnum):
    CREATED = "CREATED"
    PLANNING = "PLANNING"
    READY = "READY"
    RUNNING = "RUNNING"
    REVIEWING = "REVIEWING"
    REMEDIATING = "REMEDIATING"
    VERIFYING = "VERIFYING"
    COMPLETED = "COMPLETED"
    BLOCKED = "BLOCKED"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"


TERMINAL_RUN_STATUSES: frozenset[RunStatus] = frozenset(
    {
        RunStatus.COMPLETED,
        RunStatus.FAILED,
        RunStatus.CANCELLED,
    }
)


def is_terminal_run_status(status: RunStatus) -> bool:
    """Return whether a Run status is terminal."""

    return status in TERMINAL_RUN_STATUSES


def ensure_run_transition_allowed(
    current: RunStatus,
    target: RunStatus,
) -> None:
    """Enforce the currently specified Run terminality invariant.

    The specification does not yet define a complete transition graph, so this
    primitive deliberately enforces only the explicit rule that a terminal Run
    cannot become active again.
    """

    if is_terminal_run_status(current) and current is not target:
        raise DomainInvariantError(
            f"Terminal Run status cannot transition to a different state: {current} -> {target}"
        )
