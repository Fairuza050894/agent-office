from agent_office.config import get_settings


def test_default_settings_are_local_and_safe() -> None:
    settings = get_settings()

    assert settings.app_name == "Agent Office"
    assert settings.host == "127.0.0.1"
    assert settings.port == 8000
