"""Executor-neutral AgentProfile primitives.

Phase 3A models AgentProfile as a bounded, versioned built-in catalog. No
AgentProfile mutation behavior exists yet, so profiles are not persisted in a
table; WorkflowSnapshots record the profile key and version they were frozen
with, which keeps historical Runs interpretable.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum
from uuid import NAMESPACE_URL, uuid5

from agent_office.domain.errors import DomainInvariantError
from agent_office.domain.identifiers import AgentProfileId
from agent_office.domain.workflow import AgentAccessMode

AGENT_PROFILE_NAMESPACE = f"{NAMESPACE_URL}/agent-office/agent-profile"


class AgentProfileStatus(StrEnum):
    """Lifecycle of a reusable AgentProfile."""

    ACTIVE = "ACTIVE"
    ARCHIVED = "ARCHIVED"


@dataclass(frozen=True, slots=True)
class AgentProfile:
    """A reusable engineering responsibility, independent of any Executor."""

    id: AgentProfileId
    key: str
    name: str
    description: str
    default_access_mode: AgentAccessMode
    version: int = 1
    status: AgentProfileStatus = AgentProfileStatus.ACTIVE

    def __post_init__(self) -> None:
        key = self.key.strip().lower()

        if not key:
            raise DomainInvariantError("Agent profile key must not be empty")

        if self.version < 1:
            raise DomainInvariantError("Agent profile version must be at least 1")

        object.__setattr__(self, "key", key)


def agent_profile_id_for_key(key: str) -> AgentProfileId:
    """Derive the stable identifier of a built-in AgentProfile."""

    normalized = key.strip().lower()

    if not normalized:
        raise DomainInvariantError("Agent profile key must not be empty")

    return AgentProfileId(uuid5(NAMESPACE_URL, f"{AGENT_PROFILE_NAMESPACE}:{normalized}"))


def _profile(
    key: str,
    name: str,
    description: str,
    access_mode: AgentAccessMode,
) -> AgentProfile:
    return AgentProfile(
        id=agent_profile_id_for_key(key),
        key=key,
        name=name,
        description=description,
        default_access_mode=access_mode,
    )


BUILT_IN_AGENT_PROFILES: tuple[AgentProfile, ...] = (
    _profile(
        "architect",
        "Architect",
        "Produces the technical approach for the requested work.",
        AgentAccessMode.READ_ONLY,
    ),
    _profile(
        "explorer",
        "Explorer",
        "Inspects the repository and reports factual findings.",
        AgentAccessMode.READ_ONLY,
    ),
    _profile(
        "backend-developer",
        "Backend Developer",
        "Implements backend changes in an isolated workspace.",
        AgentAccessMode.WRITE,
    ),
    _profile(
        "frontend-developer",
        "Frontend Developer",
        "Implements frontend changes in an isolated workspace.",
        AgentAccessMode.WRITE,
    ),
    _profile(
        "qa-reviewer",
        "QA Reviewer",
        "Reviews implementation correctness without writing.",
        AgentAccessMode.READ_ONLY,
    ),
    _profile(
        "security-reviewer",
        "Security Reviewer",
        "Reviews security posture and raises durable findings.",
        AgentAccessMode.READ_ONLY,
    ),
    _profile(
        "ux-reviewer",
        "UX Reviewer",
        "Reviews user-facing behavior and presentation.",
        AgentAccessMode.READ_ONLY,
    ),
    _profile(
        "verifier",
        "Verifier",
        (
            "Performs an independent Phase 3 orchestration verification pass. "
            "Does not execute repository commands and produces no test evidence."
        ),
        AgentAccessMode.READ_ONLY,
    ),
    _profile(
        "documentation-writer",
        "Documentation Writer",
        "Updates engineering documentation for the delivered work.",
        AgentAccessMode.BOUNDED_WRITE,
    ),
)

_BUILT_IN_BY_KEY: dict[str, AgentProfile] = {
    profile.key: profile for profile in BUILT_IN_AGENT_PROFILES
}


@dataclass(frozen=True, slots=True)
class AgentProfileCatalog:
    """The AgentProfile catalog a deployment resolves assignments against.

    Freezing a WorkflowSnapshot copies the resolved profile identity and version
    out of this catalog, so replacing it with a newer revision cannot change the
    meaning of an already-started Run.
    """

    profiles: tuple[AgentProfile, ...] = BUILT_IN_AGENT_PROFILES

    def __post_init__(self) -> None:
        if not self.profiles:
            raise DomainInvariantError("Agent profile catalog must not be empty")

        keys = [profile.key for profile in self.profiles]

        if len(set(keys)) != len(keys):
            raise DomainInvariantError("Agent profile catalog keys must be unique")

    def get(self, key: str) -> AgentProfile | None:
        """Return the profile registered for a stable key."""

        normalized = key.strip().lower()

        for profile in self.profiles:
            if profile.key == normalized:
                return profile

        return None

    def keys(self) -> frozenset[str]:
        """Return every stable profile key in the catalog."""

        return frozenset(profile.key for profile in self.profiles)


def agent_profile_for(key: str) -> AgentProfile | None:
    """Return the built-in AgentProfile registered for a stable key."""

    return _BUILT_IN_BY_KEY.get(key.strip().lower())
