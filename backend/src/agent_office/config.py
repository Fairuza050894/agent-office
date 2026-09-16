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
    workspace_root: Path = Field(
        default=Path("data/workspaces"),
        description="Root directory for managed workspaces.",
    )
    database_path: Path = Field(
        default=Path("data/agent-office.sqlite"),
        description="Path to the SQLite database file.",
    )

    log_level: str = Field(
        default="INFO",
        description="Application log level.",
    )


def get_settings() -> Settings:
    return Settings()
