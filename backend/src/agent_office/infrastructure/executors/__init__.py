"""Executor infrastructure adapters."""

from agent_office.infrastructure.executors.codex import (
    CODEX_EXECUTOR_ID,
    CODEX_EXECUTOR_NAME,
    CodexExecutionContext,
    CodexExecutionContextError,
    CodexExecutor,
)
from agent_office.infrastructure.executors.codex_context import (
    CodexExecutionContextResolver,
)
from agent_office.infrastructure.executors.reference import (
    REFERENCE_EXECUTOR_ID,
    REFERENCE_EXECUTOR_NAME,
    ReferenceExecutor,
    ReferenceScenario,
)
from agent_office.infrastructure.executors.registry import (
    ExecutorRegistry,
    RegisteredExecutor,
)

__all__ = [
    "CODEX_EXECUTOR_ID",
    "CODEX_EXECUTOR_NAME",
    "REFERENCE_EXECUTOR_ID",
    "REFERENCE_EXECUTOR_NAME",
    "CodexExecutionContext",
    "CodexExecutionContextError",
    "CodexExecutionContextResolver",
    "CodexExecutor",
    "ExecutorRegistry",
    "ReferenceExecutor",
    "ReferenceScenario",
    "RegisteredExecutor",
]
