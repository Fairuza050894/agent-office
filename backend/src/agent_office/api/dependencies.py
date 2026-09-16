"""FastAPI dependency boundaries for Agent Office."""

from typing import cast

from fastapi import Request

from agent_office.application.projects import ProjectService
from agent_office.application.runs import RunService
from agent_office.application.tasks import TaskService
from agent_office.persistence import SQLiteDatabase


def get_project_service(request: Request) -> ProjectService:
    """Return the Project service after ensuring its schema exists."""

    database = cast(
        SQLiteDatabase,
        request.app.state.project_database,
    )
    service = cast(
        ProjectService,
        request.app.state.project_service,
    )

    database.initialize()
    return service


def get_task_service(request: Request) -> TaskService:
    """Return the Task service (database already initialized by project dep)."""

    database = cast(
        SQLiteDatabase,
        request.app.state.project_database,
    )
    service = cast(
        TaskService,
        request.app.state.task_service,
    )

    database.initialize()
    return service


def get_run_service(request: Request) -> RunService:
    """Return the Run service (database already initialized by project dep)."""

    database = cast(
        SQLiteDatabase,
        request.app.state.project_database,
    )
    service = cast(
        RunService,
        request.app.state.run_service,
    )

    database.initialize()
    return service
