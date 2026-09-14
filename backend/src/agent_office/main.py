from importlib.metadata import PackageNotFoundError, version

from fastapi import FastAPI

from agent_office.api_models import HealthResponse, VersionResponse
from agent_office.config import get_settings


def get_package_version() -> str:
    try:
        return version("agent-office")
    except PackageNotFoundError:
        return "0.0.0"


def create_app() -> FastAPI:
    settings = get_settings()

    app = FastAPI(
        title=settings.app_name,
        version=get_package_version(),
    )

    @app.get("/health", response_model=HealthResponse)
    async def health() -> HealthResponse:
        return HealthResponse(status="ok")

    @app.get("/version", response_model=VersionResponse)
    async def application_version() -> VersionResponse:
        return VersionResponse(
            name=settings.app_name,
            version=get_package_version(),
        )

    return app


app = create_app()
