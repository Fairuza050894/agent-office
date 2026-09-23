/**
 * TypeScript types and DTOs for the Agent Office API.
 * Matching the backend models in backend/src/agent_office/api/.
 */

export type ProjectStatus = 'ACTIVE' | 'ARCHIVED'

export interface RepositorySummary {
  name: string
}

export interface Project {
  id: string
  name: string
  repository: RepositorySummary
  default_branch: string
  preferred_executor_id: string | null
  default_workflow_id: string | null
  status: ProjectStatus
  created_at: string
  updated_at: string
  archived_at: string | null
}

export interface RegisterProjectRequest {
  name: string
  repository_path: string
}

export interface Task {
  id: string
  project_id: string
  title: string
  objective: string
  constraints: string | null
  requested_workflow_id: string | null
  requested_executor_id: string | null
  created_at: string
  updated_at: string
}

export interface CreateTaskRequest {
  title: string
  objective: string
  constraints?: string | null
  requested_workflow_id?: string | null
  requested_executor_id?: string | null
}

export interface Run {
  id: string
  project_id: string
  task_id: string
  status: string
  requested_executor_id: string | null
  created_at: string
  updated_at: string
}

export interface CreateRunRequest {
  requested_executor_id?: string | null
}

export interface RunStage {
  stage_key: string
  status: string
  required: boolean
  order_hint: number
  execution_mode: string
  condition: string
  reason_code: string | null
  reason_summary: string | null
  started_at: string | null
  completed_at: string | null
}

export interface CompletionGateResponse {
  status: string
  complete: boolean
  failures: string[]
}

export interface Finding {
  id: string
  project_id: string
  run_id: string
  reviewer_agent_run_id: string
  category: string
  severity: string
  title: string
  description: string
  status: string
  blocks_completion: boolean
  created_at: string
}

export interface RunFindingsResponse {
  run_id: string
  findings: Finding[]
  open_blockers: number
}

export interface Evidence {
  id: string
  project_id: string
  task_id: string
  run_id: string
  kind: string
  status: string
  summary: string
  created_at: string
}

export interface AgentEvent {
  id: string
  event_type: string
  project_id: string
  run_id: string
  agent_run_id: string | null
  source: string
  occurred_at: string
  recorded_at: string
  payload: Record<string, unknown>
}

export interface EventPageResponse {
  events: AgentEvent[]
  next_cursor: string | null
}

export interface HealthResponse {
  status: string
}

export interface VersionResponse {
  name: string
  version: string
}

export interface ApiErrorDetail {
  status: number
  message: string
  detail?: string
}
