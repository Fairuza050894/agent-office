"""Tests for workflow definition, snapshot, and condition primitives."""

import pytest

from agent_office.domain import (
    AgentAccessMode,
    AgentAssignment,
    ChangeArea,
    ConditionOutcome,
    DomainInvariantError,
    StageCondition,
    StageDefinition,
    StageExecutionMode,
    StageKey,
    WorkflowDefinitionStatus,
    WorkflowGraph,
    evaluate_stage_condition,
)


def _stage(
    key: StageKey,
    order_hint: int,
    *,
    depends_on: tuple[StageKey, ...] = (),
    condition: StageCondition = StageCondition.ALWAYS,
    required: bool = True,
) -> StageDefinition:
    return StageDefinition(
        key=key,
        name=key.value.title(),
        order_hint=order_hint,
        assignments=(AgentAssignment(profile_key="explorer"),),
        depends_on=depends_on,
        condition=condition,
        required=required,
    )


def test_graph_rejects_cyclic_dependencies() -> None:
    with pytest.raises(DomainInvariantError, match="acyclic"):
        WorkflowGraph(
            stages=(
                _stage(StageKey.DISCOVERY, 0, depends_on=(StageKey.REVIEW,)),
                _stage(StageKey.REVIEW, 1, depends_on=(StageKey.DISCOVERY,)),
            )
        )


def test_graph_rejects_unknown_dependency() -> None:
    with pytest.raises(DomainInvariantError, match="unknown stage"):
        WorkflowGraph(stages=(_stage(StageKey.DISCOVERY, 0, depends_on=(StageKey.REVIEW,)),))


def test_graph_rejects_duplicate_stage_keys() -> None:
    with pytest.raises(DomainInvariantError, match="unique"):
        WorkflowGraph(
            stages=(
                _stage(StageKey.DISCOVERY, 0),
                _stage(StageKey.DISCOVERY, 1),
            )
        )


def test_graph_rejects_empty_stage_list() -> None:
    with pytest.raises(DomainInvariantError, match="at least one stage"):
        WorkflowGraph(stages=())


def test_graph_rejects_unsupported_schema_version() -> None:
    with pytest.raises(DomainInvariantError, match="schema version"):
        WorkflowGraph(stages=(_stage(StageKey.DISCOVERY, 0),), schema_version=99)


def test_graph_document_round_trip_preserves_semantics() -> None:
    graph = WorkflowGraph(
        stages=(
            _stage(StageKey.DISCOVERY, 0, depends_on=()),
            _stage(
                StageKey.DOCUMENTATION,
                1,
                depends_on=(StageKey.DISCOVERY,),
                condition=StageCondition.IF_UI_CHANGED,
                required=False,
            ),
        )
    )

    restored = WorkflowGraph.from_document(graph.to_document())

    assert restored == graph


def test_stage_assignment_normalizes_profile_key() -> None:
    assert AgentAssignment(profile_key="  Architect ").profile_key == "architect"


def test_stage_rejects_self_dependency() -> None:
    with pytest.raises(DomainInvariantError, match="depend on itself"):
        _stage(StageKey.DISCOVERY, 0, depends_on=(StageKey.DISCOVERY,))


def test_stage_rejects_missing_assignments() -> None:
    with pytest.raises(DomainInvariantError, match="at least one agent assignment"):
        StageDefinition(key=StageKey.DISCOVERY, name="Discovery", order_hint=0, assignments=())


def test_always_condition_is_true_regardless_of_input() -> None:
    assert evaluate_stage_condition(StageCondition.ALWAYS, None) is ConditionOutcome.TRUE


@pytest.mark.parametrize("declared", [ChangeArea.UI, ChangeArea.FRONTEND])
def test_if_ui_changed_is_true_when_ui_work_is_declared(declared: ChangeArea) -> None:
    assert (
        evaluate_stage_condition(StageCondition.IF_UI_CHANGED, (declared,)) is ConditionOutcome.TRUE
    )


def test_if_ui_changed_is_false_when_other_work_is_declared() -> None:
    assert (
        evaluate_stage_condition(StageCondition.IF_UI_CHANGED, (ChangeArea.BACKEND,))
        is ConditionOutcome.FALSE
    )


def test_if_ui_changed_is_unknown_when_nothing_was_declared() -> None:
    # UNKNOWN must never be silently interpreted as FALSE.
    assert evaluate_stage_condition(StageCondition.IF_UI_CHANGED, None) is ConditionOutcome.UNKNOWN


def test_stage_execution_mode_is_declarative_only() -> None:
    stage = StageDefinition(
        key=StageKey.DISCOVERY,
        name="Discovery",
        order_hint=0,
        assignments=(AgentAssignment(profile_key="explorer"),),
        execution_mode=StageExecutionMode.PARALLEL_ALLOWED,
    )

    assert stage.execution_mode is StageExecutionMode.PARALLEL_ALLOWED
    assert AgentAccessMode.WRITE is not AgentAccessMode.READ_ONLY
    assert WorkflowDefinitionStatus.ACTIVE.value == "ACTIVE"
