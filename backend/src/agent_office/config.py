from pydantic import BaseModel


class Settings(BaseModel):
    app_name: str = "Agent Office"
    host: str = "127.0.0.1"
    port: int = 8000


def get_settings() -> Settings:
    return Settings()
