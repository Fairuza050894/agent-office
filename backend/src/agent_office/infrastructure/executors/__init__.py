"""Executor infrastructure adapters."""

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
    "REFERENCE_EXECUTOR_ID",
    "REFERENCE_EXECUTOR_NAME",
    "ExecutorRegistry",
    "ReferenceExecutor",
    "ReferenceScenario",
    "RegisteredExecutor",
]
