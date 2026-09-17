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
            "`data_root/workspaces`, so managed worktrees never live inside a "
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

    @property
    def managed_workspace_root(self) -> Path:
        """Return the root that managed Worktrees are created under.

        Defaulting to ``data_root/workspaces`` keeps generated worktrees inside
        Agent Office's own storage rather than inside a registered Project
        repository (WORKTREE_POLICY §12).
        """

        return self.workspace_root or (self.data_root / "workspaces")


def get_settings() -> Settings:
    return Settings()
