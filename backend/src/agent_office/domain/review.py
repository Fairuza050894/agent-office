"""Orchestration-level review verdict primitives.

Phase 3 needs to represent "a reviewer completed its assignment and reported a
blocking outcome". It deliberately does NOT model a Finding aggregate: finding
identity, severity, lifecycle, remediation linkage, and evidence are Phase 4
concerns.

The distinction that matters here is semantic:

* a reviewer that successfully reports a blocker has NOT failed operationally —
  its AgentRun is COMPLETED and carries a BLOCKER verdict;
* a reviewer whose execution failed IS an operational failure.

The verdict travels through the Executor adapter contract on the normalized
result's bounded ``safe_metadata`` (WORKFLOW_CONTRACT §31 AgentResult), which
keeps the core provider-neutral and adds no new adapter method.
"""

from __future__ import annotations

from enum import StrEnum

from agent_office.domain.executor import SafeMetadata

REVIEW_VERDICT_METADATA_KEY = "review_verdict"


class ReviewVerdict(StrEnum):
    """Bounded orchestration-level outcome of a review assignment."""

    CLEAR = "CLEAR"
    BLOCKER = "BLOCKER"


def review_verdict_metadata(verdict: ReviewVerdict) -> SafeMetadata:
    """Render a verdict for the normalized result's safe metadata."""

    return ((REVIEW_VERDICT_METADATA_KEY, verdict.value),)


def review_verdict_from_metadata(metadata: SafeMetadata) -> ReviewVerdict | None:
    """Read a verdict from safe metadata.

    An absent or unrecognized value returns ``None`` rather than guessing a
    verdict the executor never reported.
    """

    for key, value in metadata:
        if key.strip().lower() != REVIEW_VERDICT_METADATA_KEY:
            continue

        try:
            return ReviewVerdict(value.strip().upper())
        except ValueError:
            return None

    return None
