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
    assert settings.workspace_root is None
    assert settings.managed_workspace_root == Path("data/workspaces")
    assert settings.database_path == Path("data/agent-office.sqlite")

    assert settings.log_level == "INFO"
    assert settings.reference_scenario == "SUCCESS"
    assert settings.codex_enabled is False
    assert settings.codex_cli_path == "codex"
    assert settings.codex_model is None


def test_codex_runtime_settings_are_bounded_and_do_not_load_credentials(monkeypatch) -> None:
    monkeypatch.setenv("AGENT_OFFICE_CODEX_ENABLED", "true")
    monkeypatch.setenv("AGENT_OFFICE_CODEX_CLI_PATH", "/opt/local/bin/codex")
    monkeypatch.setenv("AGENT_OFFICE_CODEX_MODEL", "test-model")
    monkeypatch.setenv("OPENAI_API_KEY", "must-not-become-settings")
    monkeypatch.setenv("CODEX_API_KEY", "must-not-become-settings")

    settings = get_settings()

    assert settings.codex_enabled is True
    assert settings.codex_cli_path == "/opt/local/bin/codex"
    assert settings.codex_model == "test-model"
    assert not hasattr(settings, "openai_api_key")
    assert not hasattr(settings, "codex_api_key")


def test_reference_waiting_scenario_is_explicit_and_bounded(monkeypatch) -> None:
    monkeypatch.setenv("AGENT_OFFICE_REFERENCE_SCENARIO", "waiting")

    settings = get_settings()

    assert settings.reference_scenario == "WAITING"
