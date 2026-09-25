import os
from pathlib import Path

from pydantic import BaseModel, Field


class Settings(BaseModel):
    app_name: str = "Agent Office"

    host: str = "127.0.0.1"
    port: int = 8000

    data_root: Path = Field(
        default=Path("data"),
        description="Root directory for local Agent Office data.",
    )
    artifact_root: Path = Field(
        default=Path("data/artifacts"),
        description="Root directory for generated artifacts.",
    )
    workspace_root: Path | None = Field(
        default=None,
        description=(
            "Root directory for managed Agent Office worktrees. Defaults to "
            "data_root/workspaces, so managed worktrees never live inside a "
            "registered Project repository."
        ),
    )
    database_path: Path = Field(
        default=Path("data/agent-office.sqlite"),
        description="Path to the SQLite database file.",
    )

    log_level: str = Field(
        default="INFO",
        description="Application log level.",
    )

    codex_enabled: bool = Field(
        default=False,
        description=(
            "Register the real local Codex CLI executor. Disabled by default so "
            "normal development and CI never consume provider quota."
        ),
    )
    codex_cli_path: str = Field(
        default="codex",
        min_length=1,
        description="Codex CLI executable path or command name resolved through PATH.",
    )
    codex_model: str | None = Field(
        default=None,
        description="Optional Codex model override. None uses the CLI/runtime default.",
    )
    codex_start_timeout_seconds: float = Field(default=10.0, gt=0, le=60)
    codex_cancel_timeout_seconds: float = Field(default=2.0, gt=0, le=30)
    codex_probe_timeout_seconds: float = Field(default=3.0, gt=0, le=30)

    @property
    def managed_workspace_root(self) -> Path:
        """Return the root that managed Worktrees are created under."""

        return self.workspace_root or (self.data_root / "workspaces")


def get_settings() -> Settings:
    """Load bounded non-secret runtime settings.

    Codex credentials deliberately do not enter this object. The adapter relies
    on Codex provider-native login under HOME/CODEX_HOME and passes no ambient
    API-key environment variables to executor subprocesses.
    """

    enabled = os.getenv("AGENT_OFFICE_CODEX_ENABLED")
    model = os.getenv("AGENT_OFFICE_CODEX_MODEL")
    cli_path = os.getenv("AGENT_OFFICE_CODEX_CLI_PATH")

    return Settings(
        codex_enabled=(
            enabled.strip().lower() in {"1", "true", "yes", "on"} if enabled is not None else False
        ),
        codex_model=(model.strip() or None) if model is not None else None,
        codex_cli_path=cli_path if cli_path is not None else "codex",
    )
