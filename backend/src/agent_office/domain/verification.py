"""Verification check definitions and the bounded command policy.

A verification check is a *structured* command definition — executable plus fixed
argument vector — never shell text. DOMAIN_MODEL §43 groups project verification
commands by check type; WORKFLOW_CONTRACT §53 defines the command lifecycle; and
SECURITY_MODEL §28-§36 defines how a command is classified and executed.

The policy here is deny-by-default: a command is executed only when it is
positively classified ALLOWED. UNKNOWN is never treated as safe
(SECURITY_MODEL §32).
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum

from agent_office.domain.errors import DomainInvariantError
from agent_office.domain.evidence import CommandStatus, EvidenceKind

MAX_CHECK_KEY_LENGTH = 100
MAX_EXECUTABLE_LENGTH = 100
MAX_ARGUMENT_LENGTH = 500
MAX_ARGUMENTS = 20
MAX_ENVIRONMENT_NAMES = 8

MIN_TIMEOUT_SECONDS = 1
MAX_TIMEOUT_SECONDS = 1800
DEFAULT_TIMEOUT_SECONDS = 300

MIN_OUTPUT_LIMIT_BYTES = 512
MAX_OUTPUT_LIMIT_BYTES = 262_144
DEFAULT_OUTPUT_LIMIT_BYTES = 32_768


class VerificationCheckType(StrEnum):
    """Canonical check classification.

    Matches DOMAIN_MODEL §43's command groups and maps deterministically onto an
    Evidence kind, so a check's evidence is never ambiguous.
    """

    TEST = "TEST"
    LINT = "LINT"
    TYPECHECK = "TYPECHECK"
    BUILD = "BUILD"


_CHECK_TYPE_EVIDENCE_KINDS: dict[VerificationCheckType, EvidenceKind] = {
    VerificationCheckType.TEST: EvidenceKind.TEST_RESULT,
    VerificationCheckType.LINT: EvidenceKind.LINT_RESULT,
    VerificationCheckType.TYPECHECK: EvidenceKind.TYPECHECK_RESULT,
    VerificationCheckType.BUILD: EvidenceKind.BUILD_RESULT,
}


def evidence_kind_for(check_type: VerificationCheckType) -> EvidenceKind:
    """Return the Evidence kind a check type produces."""

    return _CHECK_TYPE_EVIDENCE_KINDS[check_type]


class CommandClassification(StrEnum):
    """Canonical command classes (SECURITY_MODEL §28)."""

    ALLOWED = "ALLOWED"
    RESTRICTED = "RESTRICTED"
    FORBIDDEN = "FORBIDDEN"
    UNKNOWN = "UNKNOWN"


class CommandRejectionCode(StrEnum):
    """Controlled reasons a command definition or invocation was refused."""

    CLASSIFICATION_NOT_ALLOWED = "CLASSIFICATION_NOT_ALLOWED"
    INVALID_EXECUTABLE = "INVALID_EXECUTABLE"
    SHELL_METACHARACTER = "SHELL_METACHARACTER"
    ABSOLUTE_EXECUTABLE_PATH = "ABSOLUTE_EXECUTABLE_PATH"
    PATH_TRAVERSAL = "PATH_TRAVERSAL"
    INVALID_ARGUMENT = "INVALID_ARGUMENT"
    FORBIDDEN_ENVIRONMENT_NAME = "FORBIDDEN_ENVIRONMENT_NAME"
    TIMEOUT_OUT_OF_RANGE = "TIMEOUT_OUT_OF_RANGE"
    OUTPUT_LIMIT_OUT_OF_RANGE = "OUTPUT_LIMIT_OUT_OF_RANGE"
    WORKSPACE_UNAVAILABLE = "WORKSPACE_UNAVAILABLE"
    WORKSPACE_NOT_VERIFIABLE = "WORKSPACE_NOT_VERIFIABLE"


#: Shell interpreters are never executed. A verification check is an argv array;
#: routing it through a shell would reinterpret its arguments.
SHELL_EXECUTABLES: frozenset[str] = frozenset(
    {"sh", "bash", "zsh", "csh", "ksh", "fish", "dash", "cmd", "cmd.exe", "powershell", "pwsh"}
)

#: Metacharacters that only have meaning to a shell. Because no shell is used they
#: would be passed through literally, but a definition containing them signals an
#: attempt to express shell logic, so it is refused rather than silently inert.
SHELL_METACHARACTERS: tuple[str, ...] = (
    ";",
    "&&",
    "||",
    "`",
    "$(",
    "${",
    ">",
    "<",
    "|",
    "\n",
    "\r",
)

#: Executables that are positively allowed as verification checks. These are the
#: read-only/verification tools named by SECURITY_MODEL §29.
ALLOWED_EXECUTABLES: frozenset[str] = frozenset(
    {"pytest", "python", "python3", "ruff", "mypy", "npm", "node", "make", "go", "cargo"}
)

#: Executables that alter host or repository state and are never run as a
#: verification check (SECURITY_MODEL §30-§31). Listed so the policy reports a
#: truthful classification instead of a generic denial.
RESTRICTED_EXECUTABLES: frozenset[str] = frozenset(
    {
        "git",
        "pip",
        "pip3",
        "brew",
        "docker",
        "curl",
        "wget",
        "ssh",
        "scp",
        "rsync",
        "sudo",
        "rm",
        "mv",
        "chmod",
        "chown",
        "dd",
        "mkfs",
        "shutdown",
        "reboot",
        "launchctl",
        "security",
        "defaults",
        "osascript",
    }
)

#: Arguments that would turn an allowed executable into a state-changing or
#: arbitrary-code operation.
FORBIDDEN_ARGUMENTS: tuple[str, ...] = (
    "install",
    "uninstall",
    "publish",
    "deploy",
    "reset",
    "rebase",
    "push",
    "clean",
    "exec",
    "eval",
)

#: Flags that make an interpreter execute code supplied on the command line, or
#: from a stream, rather than a file in the workspace. The code is never a
#: reviewed artifact and its content is unknown at declaration time, so no
#: evidence about it can exist. Phase 4B has no command-approval subsystem, so an
#: operation whose effect cannot be established is DENIED rather than allowed
#: (SECURITY_MODEL §29.4).
#:
#: ``-m`` is refused for the same reason: it selects an arbitrary module.
#: ``python3 -m pytest`` must be declared as ``pytest`` instead, which names the
#: tool the evidence is about.
INTERPRETER_ESCAPE_FLAGS: dict[str, frozenset[str]] = {
    "python": frozenset({"-c", "-m", "-", "--command", "--module"}),
    "python3": frozenset({"-c", "-m", "-", "--command", "--module"}),
    "node": frozenset(
        {
            "-e",
            "-p",
            "-r",
            "-",
            "--eval",
            "--print",
            "--require",
            "--loader",
            "--experimental-loader",
            "--import",
        }
    ),
}

#: Subcommands that are the only invocations permitted for a multi-command tool.
#: A tool that is not listed is not invoked through a subcommand, and a tool that
#: is listed accepts nothing else: ``npm install`` cannot become ALLOWED merely
#: because ``npm`` is an allowlisted verification tool.
ALLOWED_SUBCOMMANDS: dict[str, frozenset[str]] = {
    "npm": frozenset({"test", "run", "run-script", "ls", "list", "outdated", "why", "pkg"}),
    "go": frozenset({"test", "vet", "build", "list", "env", "version"}),
    "cargo": frozenset({"test", "build", "check", "clippy", "fmt", "doc", "metadata", "tree"}),
}

#: Argument values that must never be supplied, whatever the executable. A check
#: runs inside the workspace it was granted, so a path it names must stay inside
#: that workspace. An absolute path would let a declaration reach a file the Run
#: was never given, and ``..`` would let it leave the workspace entirely.
TRAVERSAL_SEGMENT = ".."

#: Environment variable names that must never be forwarded to a verification
#: command (SECURITY_MODEL §16-§17).
FORBIDDEN_ENVIRONMENT_NAMES: frozenset[str] = frozenset(
    {
        "PATH",
        "PYTHONPATH",
        "LD_PRELOAD",
        "LD_LIBRARY_PATH",
        "DYLD_INSERT_LIBRARIES",
        "DYLD_LIBRARY_PATH",
        "BASH_ENV",
        "ENV",
        "SHELL",
        "HOME",
        "AWS_SECRET_ACCESS_KEY",
        "AWS_ACCESS_KEY_ID",
        "GITHUB_TOKEN",
        "GH_TOKEN",
        "OPENAI_API_KEY",
        "ANTHROPIC_API_KEY",
        "SSH_AUTH_SOCK",
        "KUBECONFIG",
    }
)

_EXECUTABLE_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._+-]*$")
_CHECK_KEY_PATTERN = re.compile(r"^[a-z0-9][a-z0-9-]*$")
_ENVIRONMENT_NAME_PATTERN = re.compile(r"^[A-Z_][A-Z0-9_]*$")


def validate_check_key(key: str) -> str:
    """Validate a stable check key, rejecting anything unusable as an identity."""

    candidate = key.strip()

    if not candidate or len(candidate) > MAX_CHECK_KEY_LENGTH:
        raise DomainInvariantError("Verification check key must be a bounded non-empty string")

    if not _CHECK_KEY_PATTERN.match(candidate):
        raise DomainInvariantError(
            "Verification check key must be lowercase alphanumeric with dashes"
        )

    return candidate


def validate_executable(executable: str) -> str:
    """Validate an executable name.

    Only a bare program name is accepted: an absolute path would let a caller
    choose which binary runs, which is exactly the substitution the policy
    exists to prevent.
    """

    candidate = executable.strip()

    if not candidate or len(candidate) > MAX_EXECUTABLE_LENGTH:
        raise DomainInvariantError("Verification executable must be a bounded non-empty string")

    if candidate.startswith("/") or candidate.startswith("~"):
        raise DomainInvariantError("Verification executable must not be an absolute path")

    if "/" in candidate or "\\" in candidate:
        raise DomainInvariantError("Verification executable must be a bare program name")

    if not _EXECUTABLE_PATTERN.match(candidate):
        raise DomainInvariantError("Verification executable contains unsupported characters")

    if candidate in RESTRICTED_EXECUTABLES:
        raise DomainInvariantError(
            f"{candidate!r} alters host or repository state and is never run as a "
            "verification check"
        )

    if candidate not in ALLOWED_EXECUTABLES:
        raise DomainInvariantError(
            f"{candidate!r} is not an allowlisted verification tool; permitted tools "
            f"are {', '.join(sorted(ALLOWED_EXECUTABLES))}"
        )

    return candidate


def validate_argument(argument: str) -> str:
    """Validate one fixed argument.

    An argument that expresses shell logic, or that would change how the
    executable behaves in a state-changing way, is refused. No shell is ever
    used, so a metacharacter would be inert — refusing it keeps a definition from
    silently meaning something different than its author intended.
    """

    candidate = argument.strip()

    if not candidate:
        raise DomainInvariantError("Verification argument must not be empty")

    if len(candidate) > MAX_ARGUMENT_LENGTH:
        raise DomainInvariantError("Verification argument is too long")

    for metacharacter in SHELL_METACHARACTERS:
        if metacharacter in candidate:
            raise DomainInvariantError(
                f"Verification argument must not contain shell syntax: {metacharacter!r}"
            )

    if "\0" in candidate:
        raise DomainInvariantError("Verification argument must not contain a null byte")

    # A flag that changes how a tool acts (``--force``), and a positional
    # subcommand that changes what it does (``npm install``), are the same class
    # of escalation: both turn a fixed check into something else.
    if candidate.lstrip("-") in FORBIDDEN_ARGUMENTS:
        raise DomainInvariantError(
            f"Verification argument {candidate!r} would change the command's effect"
        )

    return candidate


def _is_escape_flag(argument: str, denied: frozenset[str]) -> bool:
    """Return whether an argument is an interpreter's inline-code escape.

    Both ``-c`` and ``--eval`` are matched, as is a value attached to the flag
    (``-cprint(1)``, ``--eval=code``), because a flag and its value are one
    token there. A long option is only matched on its own name, so an unrelated
    value can never be mistaken for the flag.
    """

    if argument.startswith("--"):
        return argument.split("=", 1)[0] in denied

    if argument in denied:
        return True

    # A short flag with an attached value: ``-c`` plus code. Only a multi-character
    # flag may match a prefix, so a lone ``-`` never rejects ``-X`` or ``-1``.
    return any(
        len(flag) > 1
        and flag.startswith("-")
        and not flag.startswith("--")
        and argument.startswith(flag)
        for flag in denied
    )


def _named_outside_workspace(argument: str) -> str | None:
    """Return the offending part when an argument names a location outside the workspace."""

    value = argument.split("=", 1)[1] if "=" in argument else argument

    if value.startswith("/") or value.startswith("~"):
        return value

    if "\\" in value:
        return value

    if TRAVERSAL_SEGMENT in value.split("/"):
        return value

    return None


def invocation_violations(
    executable: str,
    arguments: tuple[str, ...],
) -> tuple[str, ...]:
    """Return why an invocation is not permitted, or empty when it is.

    One predicate answers both questions the policy is asked:

    * at declaration time, whether a definition may exist at all;
    * at execution time, whether an already-persisted definition may run.

    Keeping one source of truth matters because a frozen snapshot written before
    a policy change could otherwise reach a process boundary that the current
    declaration rules would have refused.

    Allowlisting the executable is not sufficient on its own: ``python3`` is a
    legitimate verification tool and ``python3 -c`` is arbitrary program
    execution. Classification therefore considers the executable *and* its
    arguments, exactly as SECURITY_MODEL §29 requires.
    """

    violations: list[str] = []

    escape_flags = INTERPRETER_ESCAPE_FLAGS.get(executable, frozenset())

    for argument in arguments:
        if escape_flags and _is_escape_flag(argument, escape_flags):
            violations.append(
                f"{executable!r} argument {argument!r} would execute code that is not a "
                "file in the workspace, which cannot be evidenced; name the tool "
                "directly instead (for example 'pytest', not 'python3 -m pytest')"
            )

    allowed_subcommands = ALLOWED_SUBCOMMANDS.get(executable)

    if allowed_subcommands is not None:
        subcommand = next(
            (argument for argument in arguments if not argument.startswith("-")),
            None,
        )

        if subcommand is None or subcommand not in allowed_subcommands:
            violations.append(
                f"{executable!r} requires one of "
                f"{', '.join(sorted(allowed_subcommands))} as its first argument; "
                f"{subcommand!r} is not a permitted verification subcommand"
            )

    for argument in arguments:
        if _named_outside_workspace(argument) is not None:
            violations.append(
                f"Verification argument {argument!r} names a location outside the "
                "workspace; every path must be workspace-relative"
            )

    return tuple(violations)


def validate_arguments(executable: str, arguments: tuple[str, ...]) -> tuple[str, ...]:
    """Validate a check's arguments against the policy for its executable.

    An operation whose effect cannot be established is denied rather than
    allowed, because Phase 4B has no command-approval subsystem through which a
    human could accept it.
    """

    validated = tuple(validate_argument(argument) for argument in arguments)
    violations = invocation_violations(executable, validated)

    if violations:
        raise DomainInvariantError(violations[0])

    return validated


def validate_environment_names(names: tuple[str, ...]) -> tuple[str, ...]:
    """Validate declared environment variable names.

    Only names for values Agent Office itself supplies are accepted. The parent
    process environment is never forwarded (SECURITY_MODEL §16).
    """

    if len(names) > MAX_ENVIRONMENT_NAMES:
        raise DomainInvariantError("Verification check declares too many environment names")

    seen: set[str] = set()
    normalized: list[str] = []

    for raw in names:
        name = raw.strip()

        if not _ENVIRONMENT_NAME_PATTERN.match(name):
            raise DomainInvariantError(f"Invalid environment variable name: {name!r}")

        if name in FORBIDDEN_ENVIRONMENT_NAMES:
            raise DomainInvariantError(
                f"Environment variable {name!r} must never be forwarded to a verification command"
            )

        if name in seen:
            raise DomainInvariantError("Verification check environment names must be unique")

        seen.add(name)
        normalized.append(name)

    return tuple(normalized)


@dataclass(frozen=True, slots=True)
class VerificationCheckDefinition:
    """A structured, bounded verification command definition.

    Declared in a WorkflowDefinition and frozen into the Run's snapshot, so the
    obligations a Run must satisfy cannot change while it is running.
    """

    key: str
    check_type: VerificationCheckType
    executable: str
    arguments: tuple[str, ...] = ()
    timeout_seconds: int = DEFAULT_TIMEOUT_SECONDS
    output_limit_bytes: int = DEFAULT_OUTPUT_LIMIT_BYTES
    environment_names: tuple[str, ...] = ()
    required: bool = True

    def __post_init__(self) -> None:
        object.__setattr__(self, "key", validate_check_key(self.key))
        object.__setattr__(self, "executable", validate_executable(self.executable))

        if len(self.arguments) > MAX_ARGUMENTS:
            raise DomainInvariantError("Verification check declares too many arguments")

        object.__setattr__(
            self,
            "arguments",
            validate_arguments(self.executable, tuple(self.arguments)),
        )

        if not MIN_TIMEOUT_SECONDS <= self.timeout_seconds <= MAX_TIMEOUT_SECONDS:
            raise DomainInvariantError(
                "Verification check timeout must be between "
                f"{MIN_TIMEOUT_SECONDS} and {MAX_TIMEOUT_SECONDS} seconds"
            )

        if not MIN_OUTPUT_LIMIT_BYTES <= self.output_limit_bytes <= MAX_OUTPUT_LIMIT_BYTES:
            raise DomainInvariantError(
                "Verification check output limit must be between "
                f"{MIN_OUTPUT_LIMIT_BYTES} and {MAX_OUTPUT_LIMIT_BYTES} bytes"
            )

        object.__setattr__(
            self,
            "environment_names",
            validate_environment_names(self.environment_names),
        )

    @property
    def evidence_kind(self) -> EvidenceKind:
        """Return the Evidence kind this check produces."""

        return evidence_kind_for(self.check_type)

    @property
    def argv(self) -> tuple[str, ...]:
        """Return the exact argument vector, with no shell involved."""

        return (self.executable, *self.arguments)

    def to_document(self) -> dict[str, object]:
        """Serialize the definition into its frozen snapshot document."""

        return {
            "key": self.key,
            "check_type": self.check_type.value,
            "executable": self.executable,
            "arguments": list(self.arguments),
            "timeout_seconds": self.timeout_seconds,
            "output_limit_bytes": self.output_limit_bytes,
            "environment_names": list(self.environment_names),
            "required": self.required,
        }

    @classmethod
    def from_document(cls, document: object) -> VerificationCheckDefinition:
        """Rebuild a validated definition from a persisted document."""

        if not isinstance(document, dict):
            raise DomainInvariantError("Verification check document must be an object")

        raw_type = document.get("check_type")
        raw_arguments = document.get("arguments", [])
        raw_names = document.get("environment_names", [])

        if not isinstance(raw_arguments, list) or not all(
            isinstance(item, str) for item in raw_arguments
        ):
            raise DomainInvariantError("Verification check arguments must be a string list")

        if not isinstance(raw_names, list) or not all(isinstance(item, str) for item in raw_names):
            raise DomainInvariantError("Verification check environment names must be a string list")

        try:
            check_type = VerificationCheckType(str(raw_type))
        except ValueError as exc:
            raise DomainInvariantError(f"Unknown verification check type: {raw_type!r}") from exc

        key = document.get("key")
        executable = document.get("executable")

        if not isinstance(key, str) or not isinstance(executable, str):
            raise DomainInvariantError("Verification check requires a key and an executable")

        timeout = document.get("timeout_seconds", DEFAULT_TIMEOUT_SECONDS)
        output_limit = document.get("output_limit_bytes", DEFAULT_OUTPUT_LIMIT_BYTES)

        return cls(
            key=key,
            check_type=check_type,
            executable=executable,
            arguments=tuple(raw_arguments),
            timeout_seconds=(timeout if isinstance(timeout, int) else DEFAULT_TIMEOUT_SECONDS),
            output_limit_bytes=(
                output_limit if isinstance(output_limit, int) else DEFAULT_OUTPUT_LIMIT_BYTES
            ),
            environment_names=tuple(raw_names),
            required=bool(document.get("required", True)),
        )


@dataclass(frozen=True, slots=True)
class CommandOutcome:
    """Factual outcome of one bounded command execution."""

    status: CommandStatus
    started_at: datetime
    completed_at: datetime
    duration_ms: int
    exit_code: int | None = None
    stdout: str = ""
    stderr: str = ""
    output_truncated: bool = False
    safe_summary: str = ""

    @property
    def reached_exit(self) -> bool:
        """Return whether the process actually exited with a status."""

        return self.exit_code is not None


@dataclass(frozen=True, slots=True)
class CommandDecision:
    """The policy's factual classification of one command (DOMAIN_MODEL §37).

    Not persisted in Phase 4B: DOMAIN_MODEL §37 permits deferring the durable
    record while enforcement stays local and simple. The decision is carried on
    the rejection reason and the verification Evidence metadata instead.
    """

    classification: CommandClassification
    reason: str = ""

    @property
    def allowed(self) -> bool:
        """Return whether policy permits execution."""

        return self.classification is CommandClassification.ALLOWED


def classify_command(definition: VerificationCheckDefinition) -> CommandDecision:
    """Classify a verification check's command.

    Deny by default: only a positively allowed executable with no state-changing
    argument and no interpreter escape is ALLOWED. Anything the policy cannot vouch
    for is RESTRICTED or UNKNOWN, and neither is executed (SECURITY_MODEL §32).

    This re-checks an invocation that the constructor already validated, because a
    definition can also arrive from a persisted snapshot written before a policy
    change. The runtime boundary must not rely on the declaration having been made
    under today's rules.
    """

    executable = definition.executable

    if executable in SHELL_EXECUTABLES:
        return CommandDecision(
            CommandClassification.FORBIDDEN,
            "A shell interpreter cannot be used as a verification command.",
        )

    violations = invocation_violations(definition.executable, definition.arguments)

    if violations:
        return CommandDecision(CommandClassification.RESTRICTED, violations[0])

    lowered_arguments = {argument.lstrip("-").lower() for argument in definition.arguments}

    if lowered_arguments & set(FORBIDDEN_ARGUMENTS):
        return CommandDecision(
            CommandClassification.FORBIDDEN,
            "The command would change state rather than verify it.",
        )

    if executable in RESTRICTED_EXECUTABLES:
        return CommandDecision(
            CommandClassification.RESTRICTED,
            "This executable requires explicit approval and is not run as a check.",
        )

    if executable in ALLOWED_EXECUTABLES:
        return CommandDecision(CommandClassification.ALLOWED)

    return CommandDecision(
        CommandClassification.UNKNOWN,
        "The executable is not on the verification allowlist.",
    )
