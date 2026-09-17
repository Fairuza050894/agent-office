from pathlib import Path

from agent_office.config import get_settings


def test_default_settings_are_local_and_safe() -> None:
    settings = get_settings()

    assert settings.app_name == "Agent Office"

    assert settings.host == "127.0.0.1"
    assert settings.host != "0.0.0.0"
    assert settings.port == 8000

    assert settings.data_root == Path("data")
    assert settings.artifact_root == Path("data/artifacts")
    # Managed worktrees default under the Agent Office data root so they never
    # land inside a registered Project repository.
    assert settings.workspace_root is None
    assert settings.managed_workspace_root == Path("data/workspaces")
    assert settings.database_path == Path("data/agent-office.sqlite")

    assert settings.log_level == "INFO"
