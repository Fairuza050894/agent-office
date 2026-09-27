"""Planning application errors."""


class PlanningError(RuntimeError):
    """Base planning application error."""


class ComposerThreadNotFoundError(PlanningError):
    """Requested ComposerThread does not exist."""


class TeamProposalNotFoundError(PlanningError):
    """Requested TeamProposal does not exist."""


class RequirementCandidateNotFoundError(PlanningError):
    """Requested RequirementCandidate does not exist."""


class PlanningPersistenceError(PlanningError):
    """A durable planning invariant was rejected."""


class PlanningTransitionError(PlanningError):
    """A requested planning state transition is not allowed."""
