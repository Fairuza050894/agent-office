"""FastAPI application composition for Agent Office."""

from importlib.metadata import PackageNotFoundError, version

from fastapi import FastAPI

from agent_office.api.projects import router as projects_router
from agent_office.api.runs import router as runs_router
from agent_office.api.tasks import router as tasks_router
from agent_office.api_models import HealthResponse, VersionResponse
from agent_office.application.projects import ProjectService
from agent_office.application.runs import RunService
from agent_office.application.tasks import TaskService
from agent_office.config import Settings, get_settings
from agent_office.infrastructure.git import GitRepositoryInspector
from agent_office.infrastructure.persistence import (
    SQLiteProjectRepository,
    SQLiteRunRepository,
    SQLiteTaskRepository,
)
from agent_office.logging_config import configure_logging
from agent_office.persistence import SQLiteDatabase


def get_package_version() -> str:
    try:
        return version("agent-office")
    except PackageNotFoundError:
        return "0.0.0"


def create_app(settings: Settings | None = None) -> FastAPI:
    resolved_settings = settings or get_settings()
    configure_logging(resolved_settings.log_level)

    app = FastAPI(
        title=resolved_settings.app_name,
        version=get_package_version(),
    )

    database = SQLiteDatabase(
        resolved_settings.database_path,
    )
    project_repository = SQLiteProjectRepository(database)
    task_repository = SQLiteTaskRepository(database)
    run_repository = SQLiteRunRepository(database)
    inspector = GitRepositoryInspector()

    app.state.project_database = database
    app.state.project_service = ProjectService(
        project_repository,
        inspector,
    )
    app.state.task_service = TaskService(
        task_repository,
        project_repository,
    )
    app.state.run_service = RunService(
        run_repository,
        task_repository,
        project_repository,
    )

    @app.get("/health", response_model=HealthResponse)
    async def health() -> HealthResponse:
        return HealthResponse(status="ok")

    @app.get("/version", response_model=VersionResponse)
    async def application_version() -> VersionResponse:
        return VersionResponse(
            name=resolved_settings.app_name,
            version=get_package_version(),
        )

    app.include_router(projects_router)
    app.include_router(tasks_router)
    app.include_router(runs_router)

    return app


app = create_app()
