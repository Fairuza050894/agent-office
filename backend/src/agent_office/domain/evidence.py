"""Evidence primitives.

Evidence represents durable engineering proof (DOMAIN_MODEL §31). It is
append-oriented: a rerun produces new Evidence rather than rewriting history.

The truth rules this module enforces:

* an executor claiming a test passed is NOT Evidence that a test passed;
* a completed AgentRun is NOT Evidence;
* a Review Finding is NOT Evidence;
* a command that started is NOT a command that finished;
* an unknown result stays unknown and is never reported as zero.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum

from agent_office.domain.errors import DomainInvariantError
from agent_office.domain.executor import SafeMetadata, validate_safe_metadata
from agent_office.domain.identifiers import (
    AgentRunId,
    EvidenceId,
    ProjectId,
    RunId,
    TaskId,
)
from agent_office.domain.timestamps import to_utc

EVIDENCE_SCHEMA_VERSION = 1

SUPPORTED_EVIDENCE_SCHEMA_VERSIONS: frozenset[int] = frozenset({EVIDENCE_SCHEMA_VERSION})

MAX_SUMMARY_LENGTH = 500

MAX_EVIDENCE_METADATA_ENTRIES = 20

#: Metadata keys carrying the typed result of an executed verification command.
COMMAND_STATUS_KEY = "command_status"
EXIT_CODE_KEY = "exit_code"
DURATION_MS_KEY = "duration_ms"
TIMED_OUT_KEY = "timed_out"
OUTPUT_TRUNCATED_KEY = "output_truncated"
CHECK_KEY_KEY = "check_key"
CHECK_TYPE_KEY = "check_type"
BASE_REVISION_KEY = "base_revision"
CURRENT_REVISION_KEY = "current_revision"
FILES_CHANGED_KEY = "files_changed"
PASSED_KEY = "passed"
FAILED_KEY = "failed"
SKIPPED_KEY = "skipped"
INSTALLATIONS_KEY = "installations"
OUTPUT_EXCERPT_KEY = "output_excerpt"
#: The Workspace a command evidence record was collected in. Opaque identity
#: only: a Workspace id is a domain identifier, never a host path.
WORKSPACE_ID_KEY = "workspace_id"
CANDIDATE_STATE_FINGERPRINT_KEY = "candidate_state_fingerprint"

#: A captured output excerpt is bounded. Raw, unbounded command output is never
#: persisted anywhere (SECURITY_MODEL §17, §362).
MAX_OUTPUT_EXCERPT_LENGTH = 1024

#: Facts that may never be guessed. A missing key means "unknown", and an
#: unknown count is never rendered as zero.
COUNT_KEYS: tuple[str, ...] = (PASSED_KEY, FAILED_KEY, SKIPPED_KEY)


class EvidenceKind(StrEnum):
    """Canonical evidence kinds (DOMAIN_MODEL §31)."""

    TEST_RESULT = "TEST_RESULT"
    LINT_RESULT = "LINT_RESULT"
    TYPECHECK_RESULT = "TYPECHECK_RESULT"
    BUILD_RESULT = "BUILD_RESULT"
    DIFF_SUMMARY = "DIFF_SUMMARY"
    REVIEW_REPORT = "REVIEW_REPORT"
    SECURITY_REVIEW = "SECURITY_REVIEW"
    UX_REVIEW = "UX_REVIEW"
    SCREENSHOT = "SCREENSHOT"
    DOCUMENT = "DOCUMENT"
    COMMAND_RESULT = "COMMAND_RESULT"
    WORKSPACE_STATUS = "WORKSPACE_STATUS"


class EvidenceStatus(StrEnum):
    """Evidence collection result, not overall Run success (DOMAIN_MODEL §32)."""

    AVAILABLE = "AVAILABLE"
    PARTIAL = "PARTIAL"
    FAILED = "FAILED"
    UNAVAILABLE = "UNAVAILABLE"


class CommandStatus(StrEnum):
    """Factual outcome of one bounded command execution."""

    PASSED = "PASSED"
    FAILED = "FAILED"
    ERROR = "ERROR"
    TIMED_OUT = "TIMED_OUT"


#: Statuses that describe a command which actually reached a process exit.
EXITED_COMMAND_STATUSES: frozenset[CommandStatus] = frozenset(
    {CommandStatus.PASSED, CommandStatus.FAILED}
)


@dataclass(frozen=True, slots=True)
class TestResult:
    """Typed command/test result carried as Evidence metadata (DOMAIN_MODEL §34).

    Every count is optional. ``None`` means the value was not established, and it
    is never rendered as zero: "no test result was collected" and "zero tests
    failed" are different facts.
    """

    command_status: CommandStatus
    exit_code: int | None = None
    duration_ms: int | None = None
    passed: int | None = None
    failed: int | None = None
    skipped: int | None = None
    timed_out: bool = False
    output_truncated: bool = False

    def __post_init__(self) -> None:
        if self.timed_out and self.command_status is CommandStatus.PASSED:
            raise DomainInvariantError("A timed-out command cannot be reported as passed")

        if self.exit_code is not None and self.timed_out:
            raise DomainInvariantError("A timed-out command has no exit code to report")

        if self.duration_ms is not None and self.duration_ms < 0:
            raise DomainInvariantError("Command duration must not be negative")

        for name, value in (
            ("passed", self.passed),
            ("failed", self.failed),
            ("skipped", self.skipped),
        ):
            if value is not None and value < 0:
                raise DomainInvariantError(f"Test count {name} must not be negative")

    def to_metadata(self) -> SafeMetadata:
        """Render the result into bounded safe metadata.

        Unknown values are omitted rather than written as zero.
        """

        pairs: list[tuple[str, str]] = [
            (COMMAND_STATUS_KEY, self.command_status.value),
            (TIMED_OUT_KEY, "true" if self.timed_out else "false"),
            (OUTPUT_TRUNCATED_KEY, "true" if self.output_truncated else "false"),
        ]

        if self.exit_code is not None:
            pairs.append((EXIT_CODE_KEY, str(self.exit_code)))

        if self.duration_ms is not None:
            pairs.append((DURATION_MS_KEY, str(self.duration_ms)))

        for key, value in (
            (PASSED_KEY, self.passed),
            (FAILED_KEY, self.failed),
            (SKIPPED_KEY, self.skipped),
        ):
            if value is not None:
                pairs.append((key, str(value)))

        return tuple(pairs)

    @classmethod
    def from_metadata(cls, metadata: SafeMetadata) -> TestResult | None:
        """Read a typed result back, returning ``None`` when it is not present."""

        values = dict(metadata)
        raw_status = values.get(COMMAND_STATUS_KEY)

        if raw_status is None:
            return None

        try:
            status = CommandStatus(raw_status)
        except ValueError:
            return None

        def optional_int(key: str) -> int | None:
            raw = values.get(key)

            if raw is None:
                return None

            try:
                return int(raw)
            except ValueError:
                return None

        return cls(
            command_status=status,
            exit_code=optional_int(EXIT_CODE_KEY),
            duration_ms=optional_int(DURATION_MS_KEY),
            passed=optional_int(PASSED_KEY),
            failed=optional_int(FAILED_KEY),
            skipped=optional_int(SKIPPED_KEY),
            timed_out=values.get(TIMED_OUT_KEY) == "true",
            output_truncated=values.get(OUTPUT_TRUNCATED_KEY) == "true",
        )

    @property
    def established(self) -> bool:
        """Return whether the command reached a real process exit."""

        return self.command_status in EXITED_COMMAND_STATUSES


@dataclass(frozen=True, slots=True)
class Evidence:
    """One durable engineering observation (DOMAIN_MODEL §31).

    Evidence is append-oriented. Nothing in this module mutates an existing
    record to represent a later rerun: a rerun creates a new row.
    """

    id: EvidenceId
    project_id: ProjectId
    task_id: TaskId
    run_id: RunId
    kind: EvidenceKind
    status: EvidenceStatus
    summary: str
    created_at: datetime
    agent_run_id: AgentRunId | None = None
    artifact_ref: str | None = None
    metadata: SafeMetadata = ()
    schema_version: int = EVIDENCE_SCHEMA_VERSION

    def __post_init__(self) -> None:
        if self.schema_version not in SUPPORTED_EVIDENCE_SCHEMA_VERSIONS:
            raise DomainInvariantError(
                f"Unsupported Evidence schema version: {self.schema_version}"
            )

        summary = self.summary.strip()

        if not summary:
            raise DomainInvariantError("Evidence summary must not be empty")

        if len(summary) > MAX_SUMMARY_LENGTH:
            raise DomainInvariantError("Evidence summary is too long")

        object.__setattr__(self, "summary", summary)

        if len(self.metadata) > MAX_EVIDENCE_METADATA_ENTRIES:
            raise DomainInvariantError("Evidence declares too many metadata entries")

        object.__setattr__(self, "metadata", validate_safe_metadata(self.metadata))
        object.__setattr__(self, "created_at", to_utc(self.created_at))

    @property
    def test_result(self) -> TestResult | None:
        """Return the typed command/test result, when this Evidence carries one."""

        return TestResult.from_metadata(self.metadata)

    @property
    def is_successful_command_evidence(self) -> bool:
        """Return whether this Evidence proves a command completed successfully.

        Requires both a collected observation and a real process exit of zero.
        A truncated capture does not change the exit code, so it does not
        invalidate the observation.
        """

        if self.status is not EvidenceStatus.AVAILABLE:
            return False

        result = self.test_result

        return result is not None and result.command_status is CommandStatus.PASSED
