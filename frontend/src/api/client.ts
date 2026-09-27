import type {
  AgentProfile,
  AgentRun,
  AuditRecord,
  ComposerMessage,
  ComposerPreparation,
  ComposerThread,
  CreateComposerThreadRequest,
  CompletionGateResponse,
  CreateRunRequest,
  CreateTaskRequest,
  EventPageResponse,
  Executor,
  Evidence,
  HealthResponse,
  PlanningArtifact,
  Project,
  RegisterProjectRequest,
  RequirementCandidate,
  ResumeRunRequest,
  Run,
  RunFindingsResponse,
  RunStage,
  StartRunRequest,
  Task,
  TeamProposal,
  VerificationStatus,
  VersionResponse,
  WorkflowDefinition,
  WorkflowSnapshot,
  Workspace,
  WorkspaceStatusResponse,
} from './types'

export class ApiError extends Error {
  readonly status: number
  readonly detail?: string

  constructor(status: number, message: string, detail?: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.detail = detail
  }
}

function parseErrorDetail(data: unknown): string | undefined {
  if (!data || typeof data !== 'object') return undefined

  const obj = data as Record<string, unknown>
  if (typeof obj.detail === 'string') return obj.detail

  if (Array.isArray(obj.detail)) {
    return obj.detail
      .map((item) => {
        if (typeof item === 'object' && item !== null && 'msg' in item) {
          const rawLoc = (item as { loc?: unknown }).loc
          const loc = Array.isArray(rawLoc)
            ? rawLoc.filter((value: unknown) => value !== 'body').map(String).join('.')
            : ''
          const msg = String((item as { msg: unknown }).msg)
          return loc ? `${loc}: ${msg}` : msg
        }
        return String(item)
      })
      .join('; ')
  }

  return undefined
}

async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  let response: Response

  try {
    response = await fetch(url, {
      ...options,
      headers: {
        Accept: 'application/json',
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers,
      },
    })
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Network request failed'
    throw new ApiError(0, `Unable to reach Agent Office backend: ${errorMsg}`)
  }

  if (!response.ok) {
    let errorDetail: string | undefined
    let errorMessage: string

    try {
      errorDetail = parseErrorDetail(await response.json())
    } catch {
      // Body was not JSON.
    }

    switch (response.status) {
      case 400:
        errorMessage = errorDetail || 'Invalid request.'
        break
      case 403:
        errorMessage = errorDetail || 'The requested operation is not permitted.'
        break
      case 404:
        errorMessage = errorDetail || 'Resource not found.'
        break
      case 409:
        errorMessage = errorDetail || 'Request conflicts with the current resource state.'
        break
      case 422:
        errorMessage = errorDetail || 'Validation failed for request data.'
        break
      case 500:
        errorMessage = 'Internal server error occurred on the backend.'
        break
      default:
        errorMessage = errorDetail || `Request failed with status ${response.status}.`
        break
    }

    throw new ApiError(response.status, errorMessage, errorDetail)
  }

  return response.json() as Promise<T>
}

export const api = {
  getHealth: (): Promise<HealthResponse> => request('/health'),
  getVersion: (): Promise<VersionResponse> => request('/version'),

  listProjects: (): Promise<Project[]> => request('/api/projects'),
  getProject: (projectId: string): Promise<Project> =>
    request(`/api/projects/${encodeURIComponent(projectId)}`),
  registerProject: (data: RegisterProjectRequest): Promise<Project> =>
    request('/api/projects', { method: 'POST', body: JSON.stringify(data) }),
  archiveProject: (projectId: string): Promise<Project> =>
    request(`/api/projects/${encodeURIComponent(projectId)}/archive`, { method: 'POST' }),

  listTasks: (projectId: string): Promise<Task[]> =>
    request(`/api/projects/${encodeURIComponent(projectId)}/tasks`),
  getTask: (taskId: string): Promise<Task> =>
    request(`/api/tasks/${encodeURIComponent(taskId)}`),
  createTask: (projectId: string, data: CreateTaskRequest): Promise<Task> =>
    request(`/api/projects/${encodeURIComponent(projectId)}/tasks`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  listRuns: (taskId: string): Promise<Run[]> =>
    request(`/api/tasks/${encodeURIComponent(taskId)}/runs`),
  getRun: (runId: string): Promise<Run> =>
    request(`/api/runs/${encodeURIComponent(runId)}`),
  createRun: (taskId: string, data: CreateRunRequest = {}): Promise<Run> =>
    request(`/api/tasks/${encodeURIComponent(taskId)}/runs`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  startRun: (runId: string, data: StartRunRequest = {}): Promise<Run> =>
    request(`/api/runs/${encodeURIComponent(runId)}/start`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  cancelRun: (runId: string): Promise<Run> =>
    request(`/api/runs/${encodeURIComponent(runId)}/cancel`, { method: 'POST' }),
  resumeRun: (runId: string, data: ResumeRunRequest = {}): Promise<Run> =>
    request(`/api/runs/${encodeURIComponent(runId)}/resume`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  reconcileRun: (runId: string): Promise<Run> =>
    request(`/api/runs/${encodeURIComponent(runId)}/reconcile`, { method: 'POST' }),

  getRunStages: (runId: string): Promise<RunStage[]> =>
    request(`/api/runs/${encodeURIComponent(runId)}/stages`),
  getRunCompletionGate: (runId: string): Promise<CompletionGateResponse> =>
    request(`/api/runs/${encodeURIComponent(runId)}/completion-gates`),
  getRunSnapshot: (runId: string): Promise<WorkflowSnapshot> =>
    request(`/api/runs/${encodeURIComponent(runId)}/snapshot`),
  getRunAgents: (runId: string): Promise<AgentRun[]> =>
    request(`/api/runs/${encodeURIComponent(runId)}/agents`),
  getRunFindings: (runId: string): Promise<RunFindingsResponse> =>
    request(`/api/runs/${encodeURIComponent(runId)}/findings`),
  acceptFindingRisk: (findingId: string, reason: string): Promise<import('./types').Finding> =>
    request(`/api/findings/${encodeURIComponent(findingId)}/accept-risk`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),
  getRunEvidence: (runId: string): Promise<Evidence[]> =>
    request(`/api/runs/${encodeURIComponent(runId)}/evidence`),
  getRunVerification: (runId: string): Promise<VerificationStatus> =>
    request(`/api/runs/${encodeURIComponent(runId)}/verification`),
  getRunEvents: (runId: string): Promise<EventPageResponse> =>
    request(`/api/runs/${encodeURIComponent(runId)}/events`),
  getRunAudit: (runId: string): Promise<AuditRecord[]> =>
    request(`/api/runs/${encodeURIComponent(runId)}/audit`),

  getRunWorkspaces: (runId: string): Promise<Workspace[]> =>
    request(`/api/runs/${encodeURIComponent(runId)}/workspaces`),
  getWorkspaceStatus: (workspaceId: string): Promise<WorkspaceStatusResponse> =>
    request(`/api/workspaces/${encodeURIComponent(workspaceId)}/status`),
  releaseWorkspace: (workspaceId: string): Promise<Workspace> =>
    request(`/api/workspaces/${encodeURIComponent(workspaceId)}/release`, { method: 'POST' }),
  reconcileWorkspace: (workspaceId: string): Promise<Workspace> =>
    request(`/api/workspaces/${encodeURIComponent(workspaceId)}/reconcile`, { method: 'POST' }),

  listAgentProfiles: (): Promise<AgentProfile[]> => request('/api/agent-profiles'),
  listExecutors: (): Promise<Executor[]> => request('/api/executors'),
  listWorkflows: (): Promise<WorkflowDefinition[]> => request('/api/workflows'),

  createComposerThread: (data: CreateComposerThreadRequest): Promise<ComposerThread> =>
    request('/api/composer/threads', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  getComposerThread: (threadId: string): Promise<ComposerThread> =>
    request(`/api/composer/threads/${encodeURIComponent(threadId)}`),
  listProjectComposerThreads: (projectId: string): Promise<ComposerThread[]> =>
    request(`/api/projects/${encodeURIComponent(projectId)}/composer/threads`),
  postComposerMessage: (threadId: string, content: string): Promise<ComposerMessage> =>
    request(`/api/composer/threads/${encodeURIComponent(threadId)}/messages`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    }),
  listComposerMessages: (threadId: string): Promise<ComposerMessage[]> =>
    request(`/api/composer/threads/${encodeURIComponent(threadId)}/messages`),
  prepareComposerThread: (threadId: string): Promise<ComposerPreparation> =>
    request(`/api/composer/threads/${encodeURIComponent(threadId)}/prepare`, {
      method: 'POST',
    }),
  listTeamProposals: (threadId: string): Promise<TeamProposal[]> =>
    request(`/api/composer/threads/${encodeURIComponent(threadId)}/team-proposals`),
  acceptTeamProposal: (proposalId: string): Promise<TeamProposal> =>
    request(`/api/team-proposals/${encodeURIComponent(proposalId)}/accept`, {
      method: 'POST',
    }),
  rejectTeamProposal: (proposalId: string): Promise<TeamProposal> =>
    request(`/api/team-proposals/${encodeURIComponent(proposalId)}/reject`, {
      method: 'POST',
    }),
  listPlanningArtifacts: (threadId: string): Promise<PlanningArtifact[]> =>
    request(`/api/composer/threads/${encodeURIComponent(threadId)}/artifacts`),
  listRequirementCandidates: (threadId: string): Promise<RequirementCandidate[]> =>
    request(`/api/composer/threads/${encodeURIComponent(threadId)}/requirements`),
}
