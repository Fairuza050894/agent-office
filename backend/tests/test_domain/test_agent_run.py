"""Tests for AgentRun lifecycle primitives."""

import pytest

from agent_office.domain import (
    DomainInvariantError,
    ensure_agent_run_transition_allowed,
    is_terminal_agent_run_status,
)
from agent_office.domain.agent_run import (
    AGENT_RUN_TERMINAL_STATUSES,
    AgentRunStatus,
    agent_run_transition_allowed,
)


def test_agent_run_status_values_match_domain_contract() -> None:
    assert list(AgentRunStatus) == [
        AgentRunStatus.PENDING,
        AgentRunStatus.STARTING,
        AgentRunStatus.RUNNING,
        AgentRunStatus.WAITING,
        AgentRunStatus.COMPLETED,
        AgentRunStatus.FAILED,
        AgentRunStatus.BLOCKED,
        AgentRunStatus.CANCELLED,
    ]


def test_terminal_agent_run_statuses_match_domain_contract() -> None:
    assert AGENT_RUN_TERMINAL_STATUSES == {
        AgentRunStatus.COMPLETED,
        AgentRunStatus.FAILED,
        AgentRunStatus.CANCELLED,
    }


def test_blocked_agent_run_is_not_terminal() -> None:
    # BLOCKED stays resolvable so unknown execution state can be reconciled.
    assert not is_terminal_agent_run_status(AgentRunStatus.BLOCKED)


def test_start_protocol_requires_executor_acknowledgement() -> None:
    ensure_agent_run_transition_allowed(AgentRunStatus.PENDING, AgentRunStatus.STARTING)
    ensure_agent_run_transition_allowed(AgentRunStatus.STARTING, AgentRunStatus.RUNNING)
    ensure_agent_run_transition_allowed(AgentRunStatus.STARTING, AgentRunStatus.FAILED)


def test_pending_cannot_jump_straight_to_running() -> None:
    assert not agent_run_transition_allowed(AgentRunStatus.PENDING, AgentRunStatus.RUNNING)

    with pytest.raises(DomainInvariantError, match="Invalid AgentRun transition"):
        ensure_agent_run_transition_allowed(AgentRunStatus.PENDING, AgentRunStatus.RUNNING)


@pytest.mark.parametrize(
    "terminal",
    [AgentRunStatus.COMPLETED, AgentRunStatus.FAILED, AgentRunStatus.CANCELLED],
)
def test_terminal_agent_run_status_cannot_regress(terminal: AgentRunStatus) -> None:
    with pytest.raises(DomainInvariantError, match="Terminal AgentRun status"):
        ensure_agent_run_transition_allowed(terminal, AgentRunStatus.RUNNING)


@pytest.mark.parametrize(
    "terminal",
    [AgentRunStatus.COMPLETED, AgentRunStatus.FAILED, AgentRunStatus.CANCELLED],
)
def test_idempotent_terminal_agent_run_transition_is_allowed(terminal: AgentRunStatus) -> None:
    ensure_agent_run_transition_allowed(terminal, terminal)


def test_waiting_agent_run_may_resume_or_finish() -> None:
    ensure_agent_run_transition_allowed(AgentRunStatus.WAITING, AgentRunStatus.RUNNING)
    ensure_agent_run_transition_allowed(AgentRunStatus.WAITING, AgentRunStatus.COMPLETED)


def test_blocked_agent_run_may_be_reconciled() -> None:
    ensure_agent_run_transition_allowed(AgentRunStatus.BLOCKED, AgentRunStatus.COMPLETED)
    ensure_agent_run_transition_allowed(AgentRunStatus.BLOCKED, AgentRunStatus.CANCELLED)
