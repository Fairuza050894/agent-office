"""Provider-neutral Executor registry.

The registry holds Executor adapters behind the Executor port. Core
orchestration never branches on Executor kind; it resolves an Executor identity
and asks the registered adapter, which keeps the core provider-neutral.
"""

from __future__ import annotations

from dataclasses import dataclass

from agent_office.application.executors.ports import ExecutorAdapter
from agent_office.domain import ExecutorDescriptor, ExecutorId


@dataclass(frozen=True, slots=True)
class RegisteredExecutor:
    """One Executor adapter plus its safe descriptor."""

    descriptor: ExecutorDescriptor

    adapter: ExecutorAdapter

    @property
    def id(self) -> ExecutorId:
        return self.descriptor.id


class ExecutorRegistry:
    """Deterministic Executor resolution over registered adapters."""

    def __init__(self, executors: tuple[RegisteredExecutor, ...]) -> None:
        self._executors = executors
        self._by_id = {executor.id: executor for executor in executors}

    def get(self, executor_id: ExecutorId) -> RegisteredExecutor | None:
        """Return a registered Executor by identity."""

        return self._by_id.get(executor_id)

    def default(self) -> RegisteredExecutor | None:
        """Return the single registered Executor when the registry is bounded."""

        if len(self._executors) != 1:
            return None

        return self._executors[0]

    def resolve(
        self,
        *,
        requested_executor_id: ExecutorId | None,
        project_preferred_executor_id: ExecutorId | None,
    ) -> RegisteredExecutor | None:
        """Resolve the Executor for a Run deterministically.

        Documented resolution order for Phase 3A:

        Run requested executor
            -> project preferred executor
            -> the single registered default executor

        An explicitly requested or project-preferred Executor is never silently
        replaced by a different one. When it is not registered the caller
        receives ``None`` and must block the Run rather than falling back. The
        single registered default is used only when neither was selected.
        """

        if requested_executor_id is not None:
            return self._by_id.get(requested_executor_id)

        if project_preferred_executor_id is not None:
            return self._by_id.get(project_preferred_executor_id)

        return self.default()

    def list(self) -> tuple[RegisteredExecutor, ...]:
        """Return every registered Executor deterministically."""

        return tuple(sorted(self._executors, key=lambda executor: str(executor.id)))
