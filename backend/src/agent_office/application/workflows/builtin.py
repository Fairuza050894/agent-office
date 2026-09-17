"""Deterministic built-in workflow definitions.

Built-in definitions are code-defined configuration rather than imported
workflow files, which keeps Phase 3A dependency-free and deterministic. Editing
a built-in workflow through the API produces a new version; already-frozen Run
snapshots are unaffected.
"""

from __future__ import annotations

from datetime import datetime
from uuid import NAMESPACE_URL, uuid5

from agent_office.domain import (
    AgentAccessMode,
    AgentAssignment,
    StageCondition,
    StageDefinition,
    StageExecutionMode,
    StageKey,
    WorkflowDefinition,
    WorkflowDefinitionId,
    WorkflowDefinitionStatus,
    WorkflowGraph,
    to_utc,
)

BUILT_IN_WORKFLOW_NAMESPACE = f"{NAMESPACE_URL}/agent-office/workflow-definition"

ENTERPRISE_ENGINEERING_KEY = "enterprise-engineering"

BUG_FIX_KEY = "bug-fix"

DEFAULT_WORKFLOW_KEY = ENTERPRISE_ENGINEERING_KEY

_READ_ONLY = AgentAccessMode.READ_ONLY
_BOUNDED_WRITE = AgentAccessMode.BOUNDED_WRITE
_WRITE = AgentAccessMode.WRITE


def workflow_definition_id_for_key(key: str) -> WorkflowDefinitionId:
    """Derive the stable identifier of a built-in WorkflowDefinition."""

    normalized = key.strip().lower()

    return WorkflowDefinitionId(uuid5(NAMESPACE_URL, f"{BUILT_IN_WORKFLOW_NAMESPACE}:{normalized}"))


def _review_loop_stages() -> tuple[StageDefinition, StageDefinition]:
    """Return the bounded review/remediation pair shared by built-in workflows.

    Remediation is optional work: it only becomes eligible when a review reports
    a blocking outcome. When review is clear it is validly skipped with a durable
    reason rather than being silently ignored.
    """

    review = StageDefinition(
        key=StageKey.REVIEW,
        name="Review",
        order_hint=2,
        assignments=(
            AgentAssignment(profile_key="qa-reviewer", access_mode=_READ_ONLY),
            AgentAssignment(profile_key="security-reviewer", access_mode=_READ_ONLY),
        ),
        depends_on=(StageKey.IMPLEMENTATION,),
    )

    remediation = StageDefinition(
        key=StageKey.REMEDIATION,
        name="Remediation",
        order_hint=3,
        required=False,
        assignments=(AgentAssignment(profile_key="backend-developer", access_mode=_WRITE),),
        depends_on=(StageKey.REVIEW,),
    )

    return review, remediation


def _verification_stage() -> StageDefinition:
    """Return the Phase 3 verification stage.

    This stage proves verification orchestration only. It does not execute
    repository commands, create Evidence, or claim that tests passed.
    """

    return StageDefinition(
        key=StageKey.VERIFICATION,
        name="Verification",
        order_hint=4,
        assignments=(AgentAssignment(profile_key="verifier", access_mode=_READ_ONLY),),
        depends_on=(StageKey.REMEDIATION,),
    )


def _enterprise_engineering_graph() -> WorkflowGraph:
    review, remediation = _review_loop_stages()

    return WorkflowGraph(
        stages=(
            StageDefinition(
                key=StageKey.DISCOVERY,
                name="Discovery",
                order_hint=0,
                execution_mode=StageExecutionMode.PARALLEL_ALLOWED,
                assignments=(
                    AgentAssignment(profile_key="architect", access_mode=_READ_ONLY),
                    AgentAssignment(profile_key="explorer", access_mode=_READ_ONLY),
                ),
            ),
            StageDefinition(
                key=StageKey.IMPLEMENTATION,
                name="Implementation",
                order_hint=1,
                assignments=(
                    AgentAssignment(profile_key="backend-developer", access_mode=_WRITE),
                    AgentAssignment(
                        profile_key="frontend-developer",
                        access_mode=_WRITE,
                        required=False,
                    ),
                ),
                depends_on=(StageKey.DISCOVERY,),
            ),
            review,
            remediation,
            _verification_stage(),
            StageDefinition(
                key=StageKey.DOCUMENTATION,
                name="Documentation",
                order_hint=5,
                assignments=(
                    AgentAssignment(profile_key="documentation-writer", access_mode=_BOUNDED_WRITE),
                ),
                depends_on=(StageKey.VERIFICATION,),
            ),
        )
    )


def _bug_fix_graph() -> WorkflowGraph:
    review, remediation = _review_loop_stages()

    return WorkflowGraph(
        stages=(
            StageDefinition(
                key=StageKey.DISCOVERY,
                name="Discovery",
                order_hint=0,
                assignments=(AgentAssignment(profile_key="explorer", access_mode=_READ_ONLY),),
            ),
            StageDefinition(
                key=StageKey.IMPLEMENTATION,
                name="Implementation",
                order_hint=1,
                assignments=(
                    AgentAssignment(profile_key="backend-developer", access_mode=_WRITE),
                    AgentAssignment(
                        profile_key="frontend-developer",
                        access_mode=_WRITE,
                        required=False,
                    ),
                ),
                depends_on=(StageKey.DISCOVERY,),
            ),
            review,
            remediation,
            _verification_stage(),
            StageDefinition(
                key=StageKey.DOCUMENTATION,
                name="Documentation",
                order_hint=5,
                required=False,
                condition=StageCondition.IF_UI_CHANGED,
                assignments=(
                    AgentAssignment(profile_key="documentation-writer", access_mode=_BOUNDED_WRITE),
                ),
                depends_on=(StageKey.VERIFICATION,),
            ),
        )
    )


def built_in_workflow_definitions(created_at: datetime) -> tuple[WorkflowDefinition, ...]:
    """Return the built-in workflow definitions in deterministic order."""

    timestamp = to_utc(created_at)

    return (
        WorkflowDefinition(
            id=workflow_definition_id_for_key(ENTERPRISE_ENGINEERING_KEY),
            key=ENTERPRISE_ENGINEERING_KEY,
            name="Enterprise Engineering",
            description=(
                "Discovery fan-out into implementation, independent review, and documentation."
            ),
            version=1,
            status=WorkflowDefinitionStatus.ACTIVE,
            graph=_enterprise_engineering_graph(),
            created_at=timestamp,
            updated_at=timestamp,
        ),
        WorkflowDefinition(
            id=workflow_definition_id_for_key(BUG_FIX_KEY),
            key=BUG_FIX_KEY,
            name="Bug Fix",
            description=(
                "Focused defect workflow with an optional documentation stage gated by UI changes."
            ),
            version=1,
            status=WorkflowDefinitionStatus.ACTIVE,
            graph=_bug_fix_graph(),
            created_at=timestamp,
            updated_at=timestamp,
        ),
    )
