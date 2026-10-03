/**
 * TypeScript DTOs matching the safe Agent Office HTTP API.
 * Unknown or unavailable backend facts remain nullable instead of being invented.
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
  resolved_executor_id: string | null
  workflow_snapshot_id: string | null
  changed_areas: string[] | null
  failure_code: string | null
  failure_summary: string | null
  started_at: string | null
  completed_at: string | null
  cancel_requested_at: string | null
  remediation_cycles_used: number
  candidate_workspace_id: string | null
  created_at: string
  updated_at: string
}

export type ResultReviewState =
  | 'NOT_READY'
  | 'AWAITING_REVIEW'
  | 'CHANGES_REQUESTED'
  | 'APPROVED'
  | 'DELIVERED'

export interface ResultReview {
  run_id: string
  task_id: string
  state: ResultReviewState
  candidate_workspace_id: string | null
  feedback: string | null
  remediation_run_id: string | null
  delivered_branch: string | null
  delivered_commit: string | null
  can_approve: boolean
  can_request_changes: boolean
}

export interface RequestResultChangesRequest {
  feedback: string
}

export interface ApproveResultRequest {
  note?: string | null
}

export interface CreateRunRequest {
  requested_executor_id?: string | null
}

export interface StartRunRequest {
  changed_areas?: string[] | null
}

export interface ResumeRunRequest {
  executor_id?: string | null
  changed_areas?: string[] | null
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

export interface StageAssignment {
  profile_key: string
  access_mode: string
  required: boolean
}

export interface WorkflowStage {
  key: string
  name: string
  order_hint: number
  execution_mode: string
  required: boolean
  condition: string
  depends_on: string[]
  assignments: StageAssignment[]
}

export interface FrozenAgentAssignment {
  stage_key: string
  profile_id: string
  profile_key: string
  profile_name: string
  profile_version: number
  access_mode: string
  required: boolean
}

export interface WorkflowSnapshot {
  id: string
  run_id: string
  project_id: string
  source_workflow_id: string | null
  source_workflow_key: string
  source_workflow_version: number
  schema_version: number
  stages: WorkflowStage[]
  agent_assignments: FrozenAgentAssignment[]
  created_at: string
}

export interface AgentRun {
  id: string
  run_id: string
  project_id: string
  stage_key: string
  agent_profile_key: string
  agent_profile_version: number
  executor_id: string
  access_mode: string
  status: string
  attempt: number
  retry_of_agent_run_id: string | null
  remediation_cycle: number
  review_verdict: string | null
  workspace_id: string | null
  result_outcome: string | null
  result_summary: string | null
  reason_code: string | null
  reason_summary: string | null
  failure_retryable: boolean | null
  started_at: string | null
  completed_at: string | null
  created_at: string
  updated_at: string
}

export interface Workspace {
  id: string
  project_id: string
  run_id: string
  owner_agent_run_id: string | null
  kind: string
  access_mode: string
  status: string
  base_revision: string | null
  git_branch: string | null
  reason_code: string | null
  reason_summary: string | null
  writable: boolean
  created_at: string
  updated_at: string
  released_at: string | null
}

export interface WorkspaceChangeSummary {
  base_revision: string
  current_revision: string | null
  files_changed: number
  insertions: number | null
  deletions: number | null
  added_paths: string[]
  modified_paths: string[]
  deleted_paths: string[]
  untracked_paths: string[]
}

export interface WorkspaceStatusResponse {
  workspace: Workspace
  change_summary: WorkspaceChangeSummary | null
}

export interface FindingLocation {
  repository_relative_path: string | null
  line_start: number | null
  line_end: number | null
  symbol: string | null
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
  location?: FindingLocation | null
  remediation_owner_agent_run_id?: string | null
  resolution_type?: string | null
  resolver_agent_run_id?: string | null
  resolution_summary?: string | null
  blocks_completion: boolean
  created_at: string
  updated_at?: string
  resolved_at?: string | null
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
  agent_run_id?: string | null
  kind: string
  status: string
  summary: string
  metadata?: Record<string, string>
  schema_version?: number
  created_at: string
}

export interface VerificationCheck {
  check_key: string
  check_type: string
  required: boolean
  command_status: string | null
  evidence_id: string | null
  satisfied: boolean
}

export interface VerificationStatus {
  run_id: string
  checked: boolean
  checks: VerificationCheck[]
  evidence_count: number
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
  sequence?: number | null
  correlation_id?: string | null
  causation_id?: string | null
  payload: Record<string, unknown>
  redacted_keys?: string[]
  created_at?: string
}

export interface EventPageResponse {
  events: AgentEvent[]
  next_cursor: string | null
}

export interface AgentProfile {
  id: string
  key: string
  name: string
  description: string
  default_access_mode: string
  version: number
  status: string
}

export interface ExecutorCapability {
  capability: string
  support: string
  limitations: string | null
  source: string | null
  checked_at: string | null
}

export interface Executor {
  id: string
  kind: string
  name: string
  status: string
  runtime_version: string | null
  health_summary: string | null
  last_check: string
  capabilities: ExecutorCapability[]
  security_limitations: string[]
}

export interface VerificationCheckDefinition {
  key: string
  check_type: string
  executable: string
  arguments: string[]
  timeout_seconds: number
  environment_names: string[]
  required: boolean
}

export interface WorkflowDefinition {
  id: string
  key: string
  name: string
  description: string
  version: number
  status: string
  schema_version: number
  stages: WorkflowStage[]
  verification_checks: VerificationCheckDefinition[]
  created_at: string
  updated_at: string
}

export interface AuditRecord {
  id: string
  project_id: string | null
  run_id: string | null
  actor_type: string
  actor_id: string | null
  action: string
  target_type: string
  target_id: string | null
  occurred_at: string
  safe_metadata: Record<string, string>
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

export type ComposerIntent = 'AUTO' | 'ASK' | 'PLAN' | 'BRAINSTORM' | 'RUN'
export type ComposerThreadStatus =
  | 'OPEN'
  | 'ACTIVE'
  | 'AWAITING_USER'
  | 'COMPLETED'
  | 'ARCHIVED'

export interface CreateComposerThreadRequest {
  project_id?: string | null
  requested_intent?: ComposerIntent
  timezone?: string
  title?: string | null
  executor_id?: string | null
  workflow_id?: string | null
}

export interface ComposerThread {
  id: string
  project_id: string | null
  requested_intent: ComposerIntent
  resolved_intent: Exclude<ComposerIntent, 'AUTO'> | null
  status: ComposerThreadStatus
  title: string | null
  timezone: string
  executor_id: string | null
  workflow_id: string | null
  created_at: string
  updated_at: string
  completed_at: string | null
}

export interface ComposerMessage {
  id: string
  thread_id: string
  actor_type: 'USER' | 'ROLE' | 'SYSTEM'
  role_key: string | null
  message_kind: 'USER_PROMPT' | 'ROLE_CONTRIBUTION' | 'SYSTEM_SUMMARY'
  content: string
  created_at: string
}

export type TeamProposalStatus =
  | 'PROPOSED'
  | 'ACCEPTED'
  | 'REJECTED'
  | 'SUPERSEDED'

export interface TeamProposalMember {
  role_key: string
  disposition: 'INCLUDED' | 'DEFERRED' | 'EXCLUDED'
  reason: string
  order_hint: number
}

export interface TeamProposal {
  id: string
  thread_id: string
  phase: 'PLANNING' | 'IMPLEMENTATION' | 'REVIEW' | 'DOCUMENTATION'
  status: TeamProposalStatus
  rationale_summary: string
  created_at: string
  decided_at: string | null
  members: TeamProposalMember[]
}

export type PlanningArtifactType =
  | 'BRIEF'
  | 'NOTE'
  | 'DECISION'
  | 'QUESTION'
  | 'RISK'
  | 'ACTION'

export interface PlanningArtifact {
  id: string
  thread_id: string
  artifact_type: PlanningArtifactType
  title: string
  content: Record<string, string | number | boolean | null>
  author_role_key: string | null
  status: 'DRAFT' | 'OPEN' | 'RESOLVED' | 'ARCHIVED'
  created_at: string
  updated_at: string
}

export interface RequirementCandidate {
  id: string
  thread_id: string
  project_id: string | null
  title: string
  problem: string
  requirement: string
  rationale: string
  acceptance_hint: string | null
  source_roles: string[]
  status: 'PROPOSED' | 'APPROVED' | 'REJECTED' | 'DEFERRED'
  created_at: string
  updated_at: string
  approved_at: string | null
  decided_at: string | null
}

export interface IntentResolution {
  resolved_intent: Exclude<ComposerIntent, 'AUTO'>
  reason_summary: string
  requires_user_action: boolean
}

export interface ComposerPreparation {
  thread: ComposerThread
  resolution: IntentResolution
  team_proposal: TeamProposal
  artifacts: PlanningArtifact[]
  requirements: RequirementCandidate[]
}

export interface PlanningEvent {
  id: string
  thread_id: string
  project_id: string | null
  event_type: string
  role_key: string | null
  occurred_at: string
  recorded_at: string
  sequence: number
  payload: Record<string, string | number | boolean | null>
}

export interface PlanningEventPageResponse {
  events: PlanningEvent[]
  next_cursor: string | null
}

export interface PlanningQuestionDecision {
  question: PlanningArtifact
  decision: PlanningArtifact
}
