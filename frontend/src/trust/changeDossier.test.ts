import { describe, expect, it } from 'vitest'

import type { AuditRecord, Evidence, Finding, Project, ResultReview, Run, Task } from '../api'
import { acceptedChangeDossierFilename, buildAcceptedChangeDossier } from './changeDossier'

const project: Project = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Agent Office',
  repository: { name: 'agent-office' },
  default_branch: 'main',
  preferred_executor_id: null,
  default_workflow_id: null,
  status: 'ACTIVE',
  created_at: '2026-10-03T00:00:00Z',
  updated_at: '2026-10-03T00:00:00Z',
  archived_at: null,
}

const task: Task = {
  id: '22222222-2222-4222-8222-222222222222',
  project_id: project.id,
  title: 'Close delivery loop',
  objective: 'Require human acceptance before delivery.',
  constraints: 'Never touch main.',
  requested_workflow_id: null,
  requested_executor_id: null,
  created_at: '2026-10-03T01:00:00Z',
  updated_at: '2026-10-03T01:00:00Z',
}

const run: Run = {
  id: '33333333-3333-4333-8333-333333333333',
  project_id: project.id,
  task_id: task.id,
  status: 'COMPLETED',
  requested_executor_id: null,
  resolved_executor_id: null,
  workflow_snapshot_id: null,
  changed_areas: null,
  failure_code: null,
  failure_summary: null,
  started_at: '2026-10-03T02:00:00Z',
  completed_at: '2026-10-03T03:00:00Z',
  cancel_requested_at: null,
  remediation_cycles_used: 0,
  candidate_workspace_id: '44444444-4444-4444-8444-444444444444',
  created_at: '2026-10-03T02:00:00Z',
  updated_at: '2026-10-03T03:00:00Z',
}

const review: ResultReview = {
  run_id: run.id,
  task_id: task.id,
  state: 'DELIVERED',
  candidate_workspace_id: run.candidate_workspace_id,
  feedback: null,
  remediation_run_id: null,
  delivered_branch: 'agent-office/accepted/task-1042',
  delivered_commit: 'a91c3f0cafe',
  changes_requested_at: null,
  approved_at: '2026-10-03T03:10:00Z',
  delivered_at: '2026-10-03T03:11:00Z',
  can_approve: false,
  can_request_changes: false,
}

const evidence: Evidence[] = [
  {
    id: 'ev-1',
    project_id: project.id,
    task_id: task.id,
    run_id: run.id,
    kind: 'COMMAND',
    status: 'PASSED',
    summary: 'npm test passed',
    created_at: '2026-10-03T02:55:00Z',
  },
]

const findings: Finding[] = [
  {
    id: 'finding-1',
    project_id: project.id,
    run_id: run.id,
    reviewer_agent_run_id: 'agent-run-1',
    category: 'CORRECTNESS',
    severity: 'WARNING',
    title: 'Missing edge-case test',
    description: 'A review observation.',
    status: 'RESOLVED',
    resolution_summary: 'Test added and re-reviewed.',
    blocks_completion: false,
    created_at: '2026-10-03T02:40:00Z',
  },
]

const audit: AuditRecord[] = [
  {
    id: 'audit-1',
    project_id: project.id,
    run_id: run.id,
    actor_type: 'USER',
    actor_id: null,
    action: 'RESULT_APPROVED',
    target_type: 'RUN',
    target_id: run.id,
    occurred_at: '2026-10-03T03:10:00Z',
    safe_metadata: {},
  },
  {
    id: 'audit-2',
    project_id: project.id,
    run_id: run.id,
    actor_type: 'SYSTEM',
    actor_id: null,
    action: 'RESULT_DELIVERED',
    target_type: 'RUN',
    target_id: run.id,
    occurred_at: '2026-10-03T03:11:00Z',
    safe_metadata: {},
  },
]

describe('accepted change dossier', () => {
  it('exports only a human-delivered result and preserves canonical distinctions', () => {
    const markdown = buildAcceptedChangeDossier({
      project,
      task,
      run,
      review,
      evidence,
      findings,
      audit,
    })

    expect(markdown).toContain('Technical `COMPLETED` and human `DELIVERED` are separate facts')
    expect(markdown).toContain('agent-office/accepted/task-1042')
    expect(markdown).toContain('npm test passed')
    expect(markdown).toContain('Missing edge-case test')
    expect(markdown).toContain('RESULT_APPROVED')
    expect(markdown).toContain('RESULT_DELIVERED')
    expect(markdown).toContain('does not imply push or merge')
  })

  it('refuses to call a technically completed but unaccepted Run a delivered dossier', () => {
    expect(() =>
      buildAcceptedChangeDossier({
        project,
        task,
        run,
        review: { ...review, state: 'AWAITING_REVIEW' },
        evidence,
        findings,
        audit,
      }),
    ).toThrow(/only be exported after human acceptance/i)
  })

  it('produces a bounded deterministic filename', () => {
    expect(acceptedChangeDossierFilename(task, run)).toBe(
      'agent-office-close-delivery-loop-33333333-change-dossier.md',
    )
  })
})
