"""Project domain primitives."""

from enum import StrEnum

from agent_office.domain.errors import DomainInvariantError


class ProjectStatus(StrEnum):
    ACTIVE = "ACTIVE"
    ARCHIVED = "ARCHIVED"


def ensure_project_allows_new_run(status: ProjectStatus) -> None:
    """Reject creation of new Runs for archived Projects."""

    if status is ProjectStatus.ARCHIVED:
        raise DomainInvariantError("Archived Projects cannot start new Runs")
