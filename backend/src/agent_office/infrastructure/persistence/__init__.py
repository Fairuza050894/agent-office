"""Persistence infrastructure adapters."""

from agent_office.infrastructure.persistence.agent_run_repository import (
    SQLiteAgentRunRepository,
)
from agent_office.infrastructure.persistence.audit_repository import (
    SQLiteAuditRecordRepository,
)
from agent_office.infrastructure.persistence.event_repository import SQLiteEventRepository
from agent_office.infrastructure.persistence.evidence_repository import (
    SQLiteEvidenceRepository,
)
from agent_office.infrastructure.persistence.finding_repository import SQLiteFindingRepository
from agent_office.infrastructure.persistence.planning_repository import (
    SQLiteComposerMessageRepository,
    SQLiteComposerThreadRepository,
    SQLitePlanningArtifactRepository,
    SQLitePlanningEventRepository,
    SQLiteRequirementCandidateRepository,
    SQLiteTeamProposalRepository,
)
from agent_office.infrastructure.persistence.project_repository import (
    SQLiteProjectRepository,
)
from agent_office.infrastructure.persistence.run_repository import SQLiteRunRepository
from agent_office.infrastructure.persistence.run_stage_repository import (
    SQLiteRunStageRepository,
)
from agent_office.infrastructure.persistence.task_repository import SQLiteTaskRepository
from agent_office.infrastructure.persistence.workflow_repository import (
    SQLiteWorkflowDefinitionRepository,
    SQLiteWorkflowSnapshotRepository,
)
from agent_office.infrastructure.persistence.workspace_repository import (
    SQLiteWorkspaceRepository,
)

__all__ = [
    "SQLiteAgentRunRepository",
    "SQLiteAuditRecordRepository",
    "SQLiteEvidenceRepository",
    "SQLiteEventRepository",
    "SQLiteFindingRepository",
    "SQLiteComposerMessageRepository",
    "SQLiteComposerThreadRepository",
    "SQLitePlanningArtifactRepository",
    "SQLitePlanningEventRepository",
    "SQLiteProjectRepository",
    "SQLiteRequirementCandidateRepository",
    "SQLiteTeamProposalRepository",
    "SQLiteRunRepository",
    "SQLiteRunStageRepository",
    "SQLiteTaskRepository",
    "SQLiteWorkflowDefinitionRepository",
    "SQLiteWorkflowSnapshotRepository",
    "SQLiteWorkspaceRepository",
]
