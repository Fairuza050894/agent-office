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
