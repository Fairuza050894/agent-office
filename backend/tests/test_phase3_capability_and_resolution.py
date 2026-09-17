"""Phase 3A hardening: capability gate and executor resolution.

The capability gate must run before any external start side effect, UNKNOWN must
not be treated as SUPPORTED, and an explicitly selected Executor must never be
silently replaced by the default.
"""

from __future__ import annotations

from uuid import uuid4

from conftest import Harness, HarnessFactory, ScriptedExecutor, registry_for

from agent_office.domain import ExecutorCapability


def _unsupported(*capabilities: ExecutorCapability) -> ScriptedExecutor:
    return ScriptedExecutor(unsupported_capabilities=frozenset(capabilities))


def _unknown(*capabilities: ExecutorCapability) -> ScriptedExecutor:
    return ScriptedExecutor(unknown_capabilities=frozenset(capabilities))


def _run(harness: Harness, **body: object) -> tuple[dict[str, object], list[dict]]:
    project = harness.register_project()
    task = harness.create_task(project["id"])
    run = harness.create_run(task["id"], **body)
    started = harness.start_run(run["id"])

    return started, harness.agent_runs(run["id"])


def test_supported_capabilities_allow_the_assignment_to_start(
    harness_factory: HarnessFactory,
) -> None:
    executor = ScriptedExecutor()
    harness = harness_factory(registry=registry_for(executor))

    started, agents = _run(harness)

    assert started["status"] == "COMPLETED"
    assert executor.start_calls == len(agents) == 8
    assert {agent["status"] for agent in agents} == {"COMPLETED"}


def test_unsupported_required_capability_blocks_before_any_start(
    harness_factory: HarnessFactory,
) -> None:
    executor = _unsupported(ExecutorCapability.START_EXECUTION, ExecutorCapability.STATUS_QUERY)
    harness = harness_factory(registry=registry_for(executor))

    started, agents = _run(harness)

    # adapter.start() was never called: no external side effect happened.
    assert executor.start_calls == 0
    assert executor.capability_calls >= 1

    assert started["status"] == "BLOCKED"
    assert started["failure_code"] == "UNKNOWN_EXECUTION_STATE"

    assert {agent["status"] for agent in agents} == {"BLOCKED"}
    assert {agent["reason_code"] for agent in agents} == {"REQUIRED_CAPABILITY_UNSUPPORTED"}

    event_types = [event["event_type"] for event in harness.events(str(started["id"]))]
    assert "agent.blocked" in event_types
    assert "agent.start.requested" not in event_types
    assert "agent.started" not in event_types


def test_unknown_required_capability_is_not_treated_as_supported(
    harness_factory: HarnessFactory,
) -> None:
    executor = _unknown(ExecutorCapability.STATUS_QUERY)
    harness = harness_factory(registry=registry_for(executor))

    started, agents = _run(harness)

    assert executor.start_calls == 0
    assert started["status"] == "BLOCKED"
    assert {agent["reason_code"] for agent in agents} == {"REQUIRED_CAPABILITY_UNSUPPORTED"}


def test_one_unsupported_capability_is_enough_to_gate(
    harness_factory: HarnessFactory,
) -> None:
    executor = _unsupported(ExecutorCapability.STATUS_QUERY)
    harness = harness_factory(registry=registry_for(executor))

    started, agents = _run(harness)

    assert executor.start_calls == 0
    assert started["status"] == "BLOCKED"
    assert {agent["status"] for agent in agents} == {"BLOCKED"}


def test_capability_gate_records_a_truthful_reason(
    harness_factory: HarnessFactory,
) -> None:
    executor = _unsupported(ExecutorCapability.START_EXECUTION)
    harness = harness_factory(registry=registry_for(executor))

    started, agents = _run(harness)

    assert agents[0]["reason_summary"] is not None
    assert "START_EXECUTION" in str(agents[0]["reason_summary"])

    blocked_event = next(
        event
        for event in harness.events(str(started["id"]))
        if event["event_type"] == "agent.blocked"
    )
    assert blocked_event["payload"]["reason_code"] == "REQUIRED_CAPABILITY_UNSUPPORTED"


def test_unrelated_unsupported_capabilities_do_not_block_execution(
    harness_factory: HarnessFactory,
) -> None:
    executor = _unsupported(ExecutorCapability.TOKEN_USAGE, ExecutorCapability.FILE_WRITE)
    harness = harness_factory(registry=registry_for(executor))

    started, agents = _run(harness)

    # Missing non-required capabilities must not be invented, but they must also
    # not block work that does not need them.
    assert started["status"] == "COMPLETED"
    assert executor.start_calls == len(agents) == 8


def test_unregistered_requested_executor_blocks_instead_of_falling_back(
    harness_factory: HarnessFactory,
) -> None:
    executor = ScriptedExecutor()
    harness = harness_factory(registry=registry_for(executor))

    started, agents = _run(harness, requested_executor_id=str(uuid4()))

    # The default Executor must not be silently substituted.
    assert executor.start_calls == 0
    assert agents == []
    assert started["status"] == "BLOCKED"
    assert started["failure_code"] == "EXECUTOR_UNAVAILABLE"
    assert started["resolved_executor_id"] is None


def test_unregistered_project_preferred_executor_blocks_instead_of_falling_back(
    harness_factory: HarnessFactory,
) -> None:
    executor = ScriptedExecutor()
    harness = harness_factory(registry=registry_for(executor))

    project = harness.register_project()
    database = harness.app.state.project_database
    database.initialize()

    with database.transaction() as connection:
        connection.execute(
            "UPDATE projects SET preferred_executor_id = ? WHERE id = ?",
            (str(uuid4()), project["id"]),
        )

    task = harness.create_task(project["id"])
    run = harness.create_run(task["id"])
    started = harness.start_run(run["id"])

    assert executor.start_calls == 0
    assert started["status"] == "BLOCKED"
    assert started["failure_code"] == "EXECUTOR_UNAVAILABLE"


def test_registered_project_preferred_executor_is_used(
    harness_factory: HarnessFactory,
) -> None:
    """A registered project preference is honoured rather than defaulted."""

    preferred = ScriptedExecutor(executor_id="00000000-0000-4000-8000-0000000000bb")
    other = ScriptedExecutor(executor_id="00000000-0000-4000-8000-0000000000cc")
    harness = harness_factory(registry=registry_for(preferred, other))

    project = harness.register_project()
    database = harness.app.state.project_database
    database.initialize()

    with database.transaction() as connection:
        connection.execute(
            "UPDATE projects SET preferred_executor_id = ? WHERE id = ?",
            (str(preferred.descriptor().id), project["id"]),
        )

    task = harness.create_task(project["id"])
    run = harness.create_run(task["id"])
    started = harness.start_run(run["id"])

    assert started["status"] == "COMPLETED"
    assert started["resolved_executor_id"] == str(preferred.descriptor().id)
    assert preferred.start_calls > 0
    assert other.start_calls == 0


def test_no_selection_with_multiple_registered_executors_requires_a_choice(
    harness_factory: HarnessFactory,
) -> None:
    first = ScriptedExecutor(executor_id="00000000-0000-4000-8000-0000000000bb")
    second = ScriptedExecutor(executor_id="00000000-0000-4000-8000-0000000000cc")
    harness = harness_factory(registry=registry_for(first, second))

    started, _ = _run(harness)

    # With more than one Executor available and no explicit choice, Agent Office
    # must not guess.
    assert started["status"] == "BLOCKED"
    assert started["failure_code"] == "EXECUTOR_UNAVAILABLE"
    assert first.start_calls == 0
    assert second.start_calls == 0
