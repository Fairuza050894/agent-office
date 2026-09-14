from pathlib import Path

from pydantic import BaseModel, Field


class Settings(BaseModel):
    app_name: str = "Agent Office"
    host: str = "127.0.0.1"
    port: int = 8000
    database_path: Path = Field(
        default=Path("data/agent-office.sqlite"),
        description="Path to the SQLite database file.",
    )


def get_settings() -> Settings:
    return Settings()
