"""Tests for Run lifecycle primitives."""

import pytest

from agent_office.domain import (
    TERMINAL_RUN_STATUSES,
    DomainInvariantError,
    RunStatus,
    ensure_run_transition_allowed,
    is_terminal_run_status,
)


def test_run_status_values_match_domain_contract() -> None:
    assert list(RunStatus) == [
        RunStatus.CREATED,
        RunStatus.PLANNING,
        RunStatus.READY,
        RunStatus.RUNNING,
        RunStatus.REVIEWING,
        RunStatus.REMEDIATING,
        RunStatus.VERIFYING,
        RunStatus.COMPLETED,
        RunStatus.BLOCKED,
        RunStatus.FAILED,
        RunStatus.CANCELLED,
    ]


def test_terminal_run_statuses_match_domain_contract() -> None:
    assert TERMINAL_RUN_STATUSES == {
        RunStatus.COMPLETED,
        RunStatus.FAILED,
        RunStatus.CANCELLED,
    }


@pytest.mark.parametrize(
    "status",
    [
        RunStatus.COMPLETED,
        RunStatus.FAILED,
        RunStatus.CANCELLED,
    ],
)
def test_terminal_statuses_are_terminal(status: RunStatus) -> None:
    assert is_terminal_run_status(status)


def test_blocked_is_not_terminal() -> None:
    assert not is_terminal_run_status(RunStatus.BLOCKED)


def test_terminal_run_cannot_become_active_again() -> None:
    with pytest.raises(
        DomainInvariantError,
        match="Terminal Run status",
    ):
        ensure_run_transition_allowed(
            RunStatus.COMPLETED,
            RunStatus.RUNNING,
        )


def test_idempotent_terminal_status_is_allowed() -> None:
    ensure_run_transition_allowed(
        RunStatus.COMPLETED,
        RunStatus.COMPLETED,
    )


def test_blocked_run_may_continue() -> None:
    ensure_run_transition_allowed(
        RunStatus.BLOCKED,
        RunStatus.RUNNING,
    )
