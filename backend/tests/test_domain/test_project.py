"""Tests for Project domain primitives."""

import pytest

from agent_office.domain import (
    DomainInvariantError,
    ProjectStatus,
    ensure_project_allows_new_run,
)


def test_project_status_values_match_domain_contract() -> None:
    assert set(ProjectStatus) == {
        ProjectStatus.ACTIVE,
        ProjectStatus.ARCHIVED,
    }


def test_active_project_allows_new_run() -> None:
    ensure_project_allows_new_run(ProjectStatus.ACTIVE)


def test_archived_project_rejects_new_run() -> None:
    with pytest.raises(
        DomainInvariantError,
        match="Archived Projects",
    ):
        ensure_project_allows_new_run(ProjectStatus.ARCHIVED)
