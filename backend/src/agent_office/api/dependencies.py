"""FastAPI dependency boundaries for Agent Office."""

from typing import cast

from fastapi import Request

from agent_office.application.projects import ProjectService
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
