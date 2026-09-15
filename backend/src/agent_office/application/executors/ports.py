"""Provider-neutral Executor application port."""

from __future__ import annotations

from typing import Protocol

from agent_office.domain import (
    CancelExecutionResult,
    CapabilityReport,
    ExecutionResult,
    ExecutionStatus,
    ExecutorDescriptor,
    ExecutorHealth,
    ExecutorSessionRef,
    ReconciliationResult,
    StartExecutionRequest,
    StartExecutionResult,
)


class ExecutorAdapter(Protocol):
    """Boundary implemented by ReferenceExecutor and real adapters."""

    async def describe(self) -> ExecutorDescriptor:
        """Return safe Executor identity and state."""
        ...

    async def capabilities(self) -> CapabilityReport:
        """Return factual capability support."""
        ...

    async def health(self) -> ExecutorHealth:
        """Return the current known health state."""
        ...

    async def start(
        self,
        request: StartExecutionRequest,
    ) -> StartExecutionResult:
        """Attempt to start one bounded execution."""
        ...

    async def get_status(
        self,
        session: ExecutorSessionRef,
    ) -> ExecutionStatus:
        """Return canonical status for one session."""
        ...

    async def cancel(
        self,
        session: ExecutorSessionRef,
    ) -> CancelExecutionResult:
        """Request cancellation without assuming confirmation."""
        ...

    async def reconcile(
        self,
        session: ExecutorSessionRef,
    ) -> ReconciliationResult:
        """Reconcile uncertain external session state."""
        ...

    async def fetch_result(
        self,
        session: ExecutorSessionRef,
    ) -> ExecutionResult:
        """Fetch the canonical final execution result."""
        ...
