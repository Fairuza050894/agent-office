"""Central workflow validation.

A single validation path is used by workflow creation, workflow revision, the
validation endpoint, and the Run start gate. That guarantees an invalid
definition can never be stored, and a definition that became invalid after
storage can never start a Run.

Structural graph validity (acyclic dependencies, unique stage keys, known
dependency targets, at least one assignment per stage) is enforced when a
``WorkflowGraph`` is constructed. This module adds the semantic checks that
require knowledge of the AgentProfile catalog and of workflow reachability.
"""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass
from enum import StrEnum

from agent_office.domain.errors import DomainInvariantError
from agent_office.domain.workflow import StageKey, WorkflowGraph

MAX_REPORTED_ISSUES = 50


class WorkflowValidationCode(StrEnum):
    """Stable, machine-readable workflow validation issue codes."""

    UNKNOWN_AGENT_PROFILE = "UNKNOWN_AGENT_PROFILE"
    DUPLICATE_STAGE_ASSIGNMENT = "DUPLICATE_STAGE_ASSIGNMENT"
    NO_TERMINAL_STAGE = "NO_TERMINAL_STAGE"
    UNREACHABLE_STAGE = "UNREACHABLE_STAGE"


@dataclass(frozen=True, slots=True)
class WorkflowValidationIssue:
    """One workflow validation issue with a safe explanation."""

    code: WorkflowValidationCode
    message: str
    stage_key: StageKey | None = None


@dataclass(frozen=True, slots=True)
class WorkflowValidationReport:
    """Result of validating one workflow graph."""

    issues: tuple[WorkflowValidationIssue, ...]

    @property
    def valid(self) -> bool:
        """Return whether the graph passed every validation check."""

        return not self.issues

    def require_valid(self) -> None:
        """Raise a domain invariant error describing every blocking issue."""

        if self.valid:
            return

        detail = "; ".join(f"{issue.code.value}: {issue.message}" for issue in self.issues)

        raise DomainInvariantError(f"Workflow definition is invalid: {detail}")


def validate_workflow_graph(
    graph: WorkflowGraph,
    *,
    known_profile_keys: Iterable[str],
) -> WorkflowValidationReport:
    """Validate a workflow graph against the registered AgentProfile catalog."""

    known = {key.strip().lower() for key in known_profile_keys}
    issues: list[WorkflowValidationIssue] = []

    for stage in graph.ordered_stages():
        seen: set[str] = set()

        for assignment in stage.assignments:
            if assignment.profile_key in seen:
                issues.append(
                    WorkflowValidationIssue(
                        code=WorkflowValidationCode.DUPLICATE_STAGE_ASSIGNMENT,
                        message=(
                            f"Stage {stage.key.value} assigns agent profile "
                            f"{assignment.profile_key} more than once."
                        ),
                        stage_key=stage.key,
                    )
                )
            else:
                seen.add(assignment.profile_key)

            if assignment.profile_key not in known:
                issues.append(
                    WorkflowValidationIssue(
                        code=WorkflowValidationCode.UNKNOWN_AGENT_PROFILE,
                        message=(
                            f"Stage {stage.key.value} references unknown agent profile "
                            f"{assignment.profile_key}."
                        ),
                        stage_key=stage.key,
                    )
                )

    issues.extend(_reachability_issues(graph))

    return WorkflowValidationReport(issues=tuple(issues[:MAX_REPORTED_ISSUES]))


def _reachability_issues(graph: WorkflowGraph) -> list[WorkflowValidationIssue]:
    """Require at least one terminal path that every stage can reach."""

    keys = [stage.key for stage in graph.stages]
    dependents: dict[StageKey, set[StageKey]] = {key: set() for key in keys}

    for stage in graph.stages:
        for dependency in stage.depends_on:
            dependents[dependency].add(stage.key)

    sinks = {key for key in keys if not dependents[key]}

    if not sinks:
        return [
            WorkflowValidationIssue(
                code=WorkflowValidationCode.NO_TERMINAL_STAGE,
                message="Workflow has no terminal stage, so no Run could ever complete.",
            )
        ]

    reaching_sink = set(sinks)
    progressed = True

    while progressed:
        progressed = False

        for key in keys:
            if key in reaching_sink:
                continue

            if dependents[key] & reaching_sink:
                reaching_sink.add(key)
                progressed = True

    return [
        WorkflowValidationIssue(
            code=WorkflowValidationCode.UNREACHABLE_STAGE,
            message=(
                f"Stage {key.value} cannot reach any terminal stage, "
                "so it can never contribute to Run completion."
            ),
            stage_key=key,
        )
        for key in keys
        if key not in reaching_sink
    ]
