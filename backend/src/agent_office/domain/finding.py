"""Finding primitives.

A Finding is a durable reviewer observation. DOMAIN_MODEL §28 defines the
aggregate, §29 its invariants, §30 its optional source location, and
WORKFLOW_CONTRACT §34-§38 define how reviewers create them and how severity
affects workflow progression.

Two rules dominate the design:

* a reviewer that reports a blocker has NOT failed — its AgentRun is COMPLETED
  and the Finding is the durable observation it produced;
* a Finding is never silently deleted, rewritten, or auto-resolved by an
  implementation agent claiming it is fixed.
"""

from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum

from agent_office.domain.errors import DomainInvariantError
from agent_office.domain.executor import SafeMetadata
from agent_office.domain.identifiers import (
    AgentRunId,
    FindingId,
    ProjectId,
    RunId,
)
from agent_office.domain.timestamps import to_utc

#: Bounded lengths keep a Finding durable and inspectable without carrying
#: arbitrary provider text into storage.
MAX_TITLE_LENGTH = 200
MAX_DESCRIPTION_LENGTH = 2000
MAX_RESOLUTION_SUMMARY_LENGTH = 1000
MAX_PATH_LENGTH = 500
MAX_SYMBOL_LENGTH = 200

#: A single review result may report at most this many findings. The bound keeps
#: the normalized transport (bounded safe metadata) genuinely bounded.
MAX_FINDINGS_PER_REVIEW = 8


class FindingSeverity(StrEnum):
    """Canonical severity (DOMAIN_MODEL §28, WORKFLOW_CONTRACT §35)."""

    INFO = "INFO"
    WARNING = "WARNING"
    BLOCKER = "BLOCKER"


class FindingStatus(StrEnum):
    """Canonical Finding lifecycle (DOMAIN_MODEL §28)."""

    OPEN = "OPEN"
    ACKNOWLEDGED = "ACKNOWLEDGED"
    REMEDIATING = "REMEDIATING"
    RESOLVED = "RESOLVED"
    ACCEPTED_RISK = "ACCEPTED_RISK"


class FindingCategory(StrEnum):
    """Provider-neutral review dimension.

    DOMAIN_MODEL §28 requires the field but does not enumerate it. Phase 4B
    defines a closed set so a reviewer can never inject arbitrary text into
    durable storage, and so the category stays inspectable and queryable.
    """

    CORRECTNESS = "CORRECTNESS"
    SECURITY = "SECURITY"
    MAINTAINABILITY = "MAINTAINABILITY"
    PERFORMANCE = "PERFORMANCE"
    TEST_COVERAGE = "TEST_COVERAGE"
    DOCUMENTATION = "DOCUMENTATION"
    OTHER = "OTHER"


class FindingResolutionType(StrEnum):
    """How a Finding stopped being open (EVENT_CONTRACT §49)."""

    REMEDIATED = "REMEDIATED"
    ACCEPTED_RISK = "ACCEPTED_RISK"
    INVALIDATED = "INVALIDATED"


class FindingReasonCode(StrEnum):
    """Controlled reasons for a Finding that cannot progress.

    Duplicate reviewer delivery needs no code: the schema's UNIQUE dedupe key
    makes a second Finding for the same observation impossible rather than
    merely reported.
    """

    REMEDIATION_OWNER_UNKNOWN = "REMEDIATION_OWNER_UNKNOWN"


#: Finding statuses that still block a Run when severity is BLOCKER.
OPEN_FINDING_STATUSES: frozenset[FindingStatus] = frozenset(
    {FindingStatus.OPEN, FindingStatus.ACKNOWLEDGED, FindingStatus.REMEDIATING}
)

#: Finding statuses from which no further transition is permitted.
TERMINAL_FINDING_STATUSES: frozenset[FindingStatus] = frozenset(
    {FindingStatus.RESOLVED, FindingStatus.ACCEPTED_RISK}
)

_ALLOWED_FINDING_TRANSITIONS: dict[FindingStatus, frozenset[FindingStatus]] = {
    FindingStatus.OPEN: frozenset(
        {
            FindingStatus.ACKNOWLEDGED,
            FindingStatus.REMEDIATING,
            FindingStatus.RESOLVED,
            FindingStatus.ACCEPTED_RISK,
        }
    ),
    FindingStatus.ACKNOWLEDGED: frozenset(
        {
            FindingStatus.REMEDIATING,
            FindingStatus.RESOLVED,
            FindingStatus.ACCEPTED_RISK,
        }
    ),
    FindingStatus.REMEDIATING: frozenset(
        {
            FindingStatus.RESOLVED,
            FindingStatus.ACCEPTED_RISK,
            # A re-review may still find the issue present, which returns the
            # Finding to an open state rather than pretending progress.
            FindingStatus.OPEN,
        }
    ),
    FindingStatus.RESOLVED: frozenset(),
    FindingStatus.ACCEPTED_RISK: frozenset(),
}


def is_terminal_finding_status(status: FindingStatus) -> bool:
    """Return whether a Finding status is terminal."""

    return status in TERMINAL_FINDING_STATUSES


def finding_transition_allowed(current: FindingStatus, target: FindingStatus) -> bool:
    """Return whether a Finding transition is permitted."""

    if current is target:
        return True

    return target in _ALLOWED_FINDING_TRANSITIONS[current]


def ensure_finding_transition_allowed(current: FindingStatus, target: FindingStatus) -> None:
    """Validate a Finding transition, failing safely when invalid."""

    if current is target:
        return

    if is_terminal_finding_status(current):
        raise DomainInvariantError(
            f"Terminal Finding status cannot transition to a different state: {current} -> {target}"
        )

    if not finding_transition_allowed(current, target):
        raise DomainInvariantError(f"Invalid Finding transition: {current} -> {target}")


def _normalized_text(value: str) -> str:
    """Collapse whitespace and case so cosmetic differences do not fork identity."""

    return re.sub(r"\s+", " ", value.strip().lower())


def validate_repository_relative_path(path: str) -> str:
    """Validate a repository-relative location, rejecting anything unsafe.

    DOMAIN_MODEL §30: never store an absolute developer-machine path where a
    repository-relative path is sufficient.
    """

    candidate = path.strip()

    if not candidate:
        raise DomainInvariantError("Finding path must not be empty")

    if len(candidate) > MAX_PATH_LENGTH:
        raise DomainInvariantError("Finding path is too long")

    if candidate.startswith("/") or candidate.startswith("~"):
        raise DomainInvariantError("Finding path must be repository-relative")

    if re.match(r"^[A-Za-z]:[\\/]", candidate):
        raise DomainInvariantError("Finding path must be repository-relative")

    segments = candidate.replace("\\", "/").split("/")

    if any(segment == ".." for segment in segments):
        raise DomainInvariantError("Finding path must not traverse outside the repository")

    return candidate


@dataclass(frozen=True, slots=True)
class FindingLocation:
    """Optional source location of a Finding (DOMAIN_MODEL §30)."""

    repository_relative_path: str | None = None
    line_start: int | None = None
    line_end: int | None = None
    symbol: str | None = None
    artifact_ref: str | None = None

    def __post_init__(self) -> None:
        if self.repository_relative_path is not None:
            object.__setattr__(
                self,
                "repository_relative_path",
                validate_repository_relative_path(self.repository_relative_path),
            )

        if self.symbol is not None:
            symbol = self.symbol.strip()

            if len(symbol) > MAX_SYMBOL_LENGTH:
                raise DomainInvariantError("Finding symbol is too long")

            object.__setattr__(self, "symbol", symbol or None)

        for name, value in (("line_start", self.line_start), ("line_end", self.line_end)):
            if value is not None and value < 1:
                raise DomainInvariantError(f"Finding {name} must be a positive line number")

        if self.line_start is not None and self.line_end is not None:
            if self.line_end < self.line_start:
                raise DomainInvariantError("Finding line_end must not precede line_start")

    @property
    def identity_fragment(self) -> str:
        """Return the part of a normalized identity this location contributes."""

        if self.repository_relative_path is None and self.symbol is None:
            return ""

        line = "" if self.line_start is None else str(self.line_start)

        return f"{self.repository_relative_path or ''}#{line}#{self.symbol or ''}"


def finding_identity_key(
    *,
    run_id: RunId,
    severity: FindingSeverity,
    category: FindingCategory,
    title: str,
    location: FindingLocation | None,
) -> str:
    """Return the normalized identity of the observation a Finding describes.

    Deliberately excludes the reviewer: the same problem reported in a later
    review cycle, possibly by a different reviewer, is the same observation. That
    is what makes "is this Finding still present?" answerable.
    """

    return "|".join(
        (
            str(run_id),
            severity.value,
            category.value,
            _normalized_text(title),
            "" if location is None else location.identity_fragment,
        )
    )


def finding_dedupe_key(
    identity_key: str,
    reviewer_agent_run_id: AgentRunId,
) -> str:
    """Return the delivery identity used to absorb duplicate review delivery.

    Includes the reviewer, so one reviewer delivering the same observation twice
    produces one Finding, while two reviewers independently reporting the same
    observation stay separately attributed rather than being aggressively merged.
    """

    digest = hashlib.sha256(f"{identity_key}|{reviewer_agent_run_id}".encode()).hexdigest()

    return f"finding/{digest[:48]}"


@dataclass(frozen=True, slots=True)
class Finding:
    """A durable reviewer observation (DOMAIN_MODEL §28)."""

    id: FindingId
    project_id: ProjectId
    run_id: RunId
    reviewer_agent_run_id: AgentRunId
    category: FindingCategory
    severity: FindingSeverity
    title: str
    description: str
    status: FindingStatus
    identity_key: str
    dedupe_key: str
    created_at: datetime
    updated_at: datetime
    location: FindingLocation | None = None
    remediation_owner_agent_run_id: AgentRunId | None = None
    resolution_type: FindingResolutionType | None = None
    resolver_agent_run_id: AgentRunId | None = None
    resolution_summary: str | None = None
    resolved_at: datetime | None = None

    def __post_init__(self) -> None:
        title = self.title.strip()

        if not title:
            raise DomainInvariantError("Finding title must not be empty")

        if len(title) > MAX_TITLE_LENGTH:
            raise DomainInvariantError("Finding title is too long")

        object.__setattr__(self, "title", title)

        description = self.description.strip()

        if not description:
            raise DomainInvariantError("Finding description must not be empty")

        if len(description) > MAX_DESCRIPTION_LENGTH:
            raise DomainInvariantError("Finding description is too long")

        object.__setattr__(self, "description", description)

        if not self.identity_key.strip():
            raise DomainInvariantError("Finding identity key must not be empty")

        if not self.dedupe_key.strip():
            raise DomainInvariantError("Finding dedupe key must not be empty")

        if self.resolution_summary is not None:
            summary = self.resolution_summary.strip()

            if len(summary) > MAX_RESOLUTION_SUMMARY_LENGTH:
                raise DomainInvariantError("Finding resolution summary is too long")

            object.__setattr__(self, "resolution_summary", summary or None)

        now_created = to_utc(self.created_at)
        now_updated = to_utc(self.updated_at)

        if now_updated < now_created:
            raise DomainInvariantError("Finding updated_at must not precede created_at")

        object.__setattr__(self, "created_at", now_created)
        object.__setattr__(self, "updated_at", now_updated)

        if self.resolved_at is not None:
            resolved_at = to_utc(self.resolved_at)

            if resolved_at < now_created:
                raise DomainInvariantError("Finding resolved_at must not precede created_at")

            object.__setattr__(self, "resolved_at", resolved_at)

        if is_terminal_finding_status(self.status):
            if self.resolved_at is None:
                raise DomainInvariantError("A resolved Finding must record resolved_at")

            if self.resolution_type is None:
                raise DomainInvariantError("A resolved Finding must record resolution_type")
        else:
            if self.resolved_at is not None:
                raise DomainInvariantError("Only a resolved Finding may record resolved_at")

            if self.resolution_type is not None:
                raise DomainInvariantError("Only a resolved Finding may record a resolution type")

        if self.resolution_type is FindingResolutionType.ACCEPTED_RISK:
            if self.status is not FindingStatus.ACCEPTED_RISK:
                raise DomainInvariantError(
                    "An accepted-risk resolution requires ACCEPTED_RISK status"
                )

            if not self.resolution_summary:
                raise DomainInvariantError(
                    "Accepted risk requires a recorded reason (DOMAIN_MODEL §29.5)"
                )

        if self.status is FindingStatus.ACCEPTED_RISK:
            if self.resolution_type is not FindingResolutionType.ACCEPTED_RISK:
                raise DomainInvariantError(
                    "ACCEPTED_RISK status requires an ACCEPTED_RISK resolution"
                )

        if self.status is FindingStatus.RESOLVED:
            if self.resolution_type is FindingResolutionType.ACCEPTED_RISK:
                raise DomainInvariantError(
                    "A RESOLVED Finding must not claim an accepted-risk resolution"
                )

    @property
    def is_blocking(self) -> bool:
        """Return whether this Finding still blocks completion."""

        return self.severity is FindingSeverity.BLOCKER and self.status in OPEN_FINDING_STATUSES

    @property
    def blocks_completion(self) -> bool:
        """Return whether completion gates must refuse while this is unresolved.

        WORKFLOW_CONTRACT §35: a BLOCKER blocks completion until it is resolved
        or explicitly accepted. INFO and WARNING never block by default.
        """

        return self.is_blocking

    @property
    def is_open(self) -> bool:
        """Return whether the Finding is still open in any sense."""

        return self.status in OPEN_FINDING_STATUSES

    def with_location(self, location: FindingLocation | None) -> Finding:
        """Return a copy carrying a source location."""

        from dataclasses import replace

        return replace(self, location=location)


# ----------------------------------------------------------------------
# Normalized reviewer report transport
#
# A reviewer reports findings through the Executor adapter contract's bounded
# ``safe_metadata`` channel. The transport is deliberately flat and indexed —
# ``finding.0.severity`` — so it stays inside the bounded safe-metadata contract,
# remains provider-neutral, and requires no provider-specific JSON parsing
# anywhere in the core.
# ----------------------------------------------------------------------


FINDING_PREFIX = "finding"

_FIELDS = (
    "severity",
    "category",
    "title",
    "description",
    "path",
    "line_start",
    "line_end",
    "symbol",
)


@dataclass(frozen=True, slots=True)
class ReportedFinding:
    """One finding as reported by a reviewer, before canonical validation."""

    severity: FindingSeverity
    category: FindingCategory
    title: str
    description: str
    location: FindingLocation | None = None


def reported_findings_from_metadata(metadata: SafeMetadata) -> tuple[ReportedFinding, ...]:
    """Read reported findings from a normalized result's safe metadata.

    An unreadable entry is skipped rather than guessed at: a malformed report
    must not become a fabricated Finding. Ordinals must be contiguous from zero,
    so a gap ends the scan instead of producing a partly-invented list.
    """

    buckets: dict[int, dict[str, str]] = {}

    for key, value in metadata:
        parts = key.strip().lower().split(".")

        if len(parts) != 3 or parts[0] != FINDING_PREFIX:
            continue

        if not parts[1].isdigit() or parts[2] not in _FIELDS:
            continue

        ordinal = int(parts[1])

        if ordinal >= MAX_FINDINGS_PER_REVIEW:
            continue

        buckets.setdefault(ordinal, {})[parts[2]] = value

    findings: list[ReportedFinding] = []

    for ordinal in sorted(buckets):
        bucket = buckets[ordinal]
        reported = _reported_from_bucket(bucket)

        if reported is not None:
            findings.append(reported)

    return tuple(findings)


def _reported_from_bucket(bucket: dict[str, str]) -> ReportedFinding | None:
    raw_severity = bucket.get("severity", "").strip().upper()
    raw_category = bucket.get("category", "").strip().upper()
    title = bucket.get("title", "").strip()
    description = bucket.get("description", "").strip()

    if not (raw_severity and raw_category and title and description):
        return None

    try:
        severity = FindingSeverity(raw_severity)
        category = FindingCategory(raw_category)
    except ValueError:
        return None

    location = _location_from_bucket(bucket)

    try:
        return ReportedFinding(
            severity=severity,
            category=category,
            title=title,
            description=description,
            location=location,
        )
    except DomainInvariantError:
        return None


def _location_from_bucket(bucket: dict[str, str]) -> FindingLocation | None:
    raw_path = bucket.get("path", "").strip()

    if not raw_path:
        return None

    try:
        path = validate_repository_relative_path(raw_path)
    except DomainInvariantError:
        # A path that is not repository-relative is not usable as a location, but
        # it does not invalidate the observation itself.
        return None

    return FindingLocation(
        repository_relative_path=path,
        line_start=_optional_positive_int(bucket.get("line_start")),
        line_end=_optional_positive_int(bucket.get("line_end")),
        symbol=bucket.get("symbol") or None,
    )


def _optional_positive_int(raw: str | None) -> int | None:
    if raw is None:
        return None

    try:
        value = int(raw.strip())
    except ValueError:
        return None

    return value if value > 0 else None


def reported_findings_metadata(
    findings: tuple[ReportedFinding, ...],
) -> SafeMetadata:
    """Render reported findings into bounded safe metadata.

    Used by the deterministic ReferenceExecutor to report review facts through
    the same normalized channel a real adapter would use.
    """

    if len(findings) > MAX_FINDINGS_PER_REVIEW:
        raise DomainInvariantError("A review result declares too many findings")

    pairs: list[tuple[str, str]] = []

    for ordinal, finding in enumerate(findings):
        prefix = f"{FINDING_PREFIX}.{ordinal}"
        pairs.append((f"{prefix}.severity", finding.severity.value))
        pairs.append((f"{prefix}.category", finding.category.value))
        pairs.append((f"{prefix}.title", finding.title))
        pairs.append((f"{prefix}.description", finding.description))

        if finding.location is not None:
            if finding.location.repository_relative_path is not None:
                pairs.append((f"{prefix}.path", finding.location.repository_relative_path))

            if finding.location.line_start is not None:
                pairs.append((f"{prefix}.line_start", str(finding.location.line_start)))

            if finding.location.line_end is not None:
                pairs.append((f"{prefix}.line_end", str(finding.location.line_end)))

            if finding.location.symbol is not None:
                pairs.append((f"{prefix}.symbol", finding.location.symbol))

    return tuple(pairs)
