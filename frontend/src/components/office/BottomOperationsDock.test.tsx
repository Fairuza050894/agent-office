import {
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react'
import {
  describe,
  expect,
  it,
  vi,
} from 'vitest'

import type {
  ComposerThread,
  PlanningArtifact,
  PlanningEvent,
  RequirementCandidate,
  Task,
} from '../../api'
import { BottomOperationsDock } from './BottomOperationsDock'

const THREAD: ComposerThread = {
  id: '11111111-1111-4111-8111-111111111111',
  project_id: '22222222-2222-4222-8222-222222222222',
  requested_intent: 'RUN',
  resolved_intent: 'RUN',
  status: 'AWAITING_USER',
  title: 'Decision test',
  timezone: 'Asia/Jakarta',
  executor_id: null,
  workflow_id: null,
  created_at: '2026-09-27T08:00:00Z',
  updated_at: '2026-09-27T08:00:00Z',
  completed_at: null,
}

const QUESTION: PlanningArtifact = {
  id: '33333333-3333-4333-8333-333333333333',
  thread_id: THREAD.id,
  artifact_type: 'QUESTION',
  title: 'Decision required',
  content: {
    question: 'How should planning continue?',
    option_a: 'Continue in read-only planning mode.',
    option_b: 'Confirm the Project and approve requirements.',
    recommendation: 'Continue planning first.',
  },
  author_role_key: 'product-manager',
  status: 'OPEN',
  created_at: '2026-09-27T08:01:00Z',
  updated_at: '2026-09-27T08:01:00Z',
}

const REQUIREMENT: RequirementCandidate = {
  id: '44444444-4444-4444-8444-444444444444',
  thread_id: THREAD.id,
  project_id: THREAD.project_id,
  title: 'Keep planning read-only',
  problem: 'Execution scope is not approved.',
  requirement: 'Planning must not mutate the repository.',
  rationale: 'Preserve planning/execution truth boundaries.',
  acceptance_hint: 'No Workspace or Run exists after planning.',
  source_roles: ['product-manager'],
  status: 'PROPOSED',
  created_at: '2026-09-27T08:02:00Z',
  updated_at: '2026-09-27T08:02:00Z',
  approved_at: null,
  decided_at: null,
}

const PLANNING_EVENT: PlanningEvent = {
  id: '55555555-5555-4555-8555-555555555555',
  thread_id: THREAD.id,
  project_id: THREAD.project_id,
  event_type: 'planning.artifact.resolved',
  role_key: null,
  occurred_at: '2026-09-27T08:03:00Z',
  recorded_at: '2026-09-27T08:03:00Z',
  sequence: 7,
  payload: {
    selected_option: 'option_a',
  },
}


const TASK: Task = {
  id: '66666666-6666-4666-8666-666666666666',
  project_id: THREAD.project_id!,
  title: 'Expose artifact preview',
  objective: 'Add a bounded artifact content API and preview surface.',
  constraints: null,
  requested_workflow_id: null,
  requested_executor_id: null,
  created_at: '2026-09-27T08:04:00Z',
  updated_at: '2026-09-27T08:04:00Z',
}

describe('BottomOperationsDock planning controls', () => {
  it('shows canonical project tasks in the Tasks tab', () => {
    render(
      <BottomOperationsDock
        events={[]}
        agents={[]}
        profiles={[]}
        selectedAgentId={null}
        onSelectAgent={() => undefined}
        modeLabel="Planning"
        tasks={[TASK]}
      />,
    )

    fireEvent.click(screen.getByRole('tab', { name: 'Tasks' }))

    expect(screen.getByText(TASK.title)).toBeInTheDocument()
    expect(screen.getByText(TASK.objective)).toBeInTheDocument()
    expect(screen.getByText('No run yet')).toBeInTheDocument()
    expect(screen.getByText('No run')).toBeInTheDocument()
  })


  it('renders an actionable decision queue with recommendation and options', () => {
    const onResolve = vi.fn()

    render(
      <BottomOperationsDock
        events={[]}
        agents={[]}
        profiles={[]}
        selectedAgentId={null}
        onSelectAgent={() => undefined}
        modeLabel="RUN · AWAITING_USER"
        planningThread={THREAD}
        planningArtifacts={[QUESTION]}
        planningRequirements={[]}
        planningEvents={[]}
        onResolvePlanningQuestion={onResolve}
      />,
    )

    fireEvent.click(screen.getByRole('tab', { name: 'Questions' }))

    expect(screen.getByText('Continue planning first.')).toBeInTheDocument()
    const option = screen.getByRole('button', {
      name: /Continue in read-only planning mode/i,
    })
    fireEvent.click(option)

    expect(onResolve).toHaveBeenCalledWith(QUESTION.id, 'option_a')
  })

  it('lets the user approve, defer, or reject a proposed requirement', () => {
    const onApprove = vi.fn()
    const onDefer = vi.fn()
    const onReject = vi.fn()

    render(
      <BottomOperationsDock
        events={[]}
        agents={[]}
        profiles={[]}
        selectedAgentId={null}
        onSelectAgent={() => undefined}
        modeLabel="PLAN · ACTIVE"
        planningThread={{ ...THREAD, resolved_intent: 'PLAN', status: 'ACTIVE' }}
        planningArtifacts={[]}
        planningRequirements={[REQUIREMENT]}
        planningEvents={[]}
        onApproveRequirement={onApprove}
        onDeferRequirement={onDefer}
        onRejectRequirement={onReject}
      />,
    )

    fireEvent.click(screen.getByRole('tab', { name: 'Requirements' }))

    const requirement = screen.getByText(REQUIREMENT.title).closest('article')
    expect(requirement).not.toBeNull()
    const scoped = within(requirement as HTMLElement)

    fireEvent.click(scoped.getByRole('button', { name: 'Approve' }))
    fireEvent.click(scoped.getByRole('button', { name: 'Defer' }))
    fireEvent.click(scoped.getByRole('button', { name: 'Reject' }))

    expect(onApprove).toHaveBeenCalledWith(REQUIREMENT.id)
    expect(onDefer).toHaveBeenCalledWith(REQUIREMENT.id)
    expect(onReject).toHaveBeenCalledWith(REQUIREMENT.id)
  })

  it('shows PlanningEvent history separately in planning Activity', () => {
    render(
      <BottomOperationsDock
        events={[]}
        agents={[]}
        profiles={[]}
        selectedAgentId={null}
        onSelectAgent={() => undefined}
        modeLabel="PLAN · ACTIVE"
        planningThread={{ ...THREAD, resolved_intent: 'PLAN', status: 'ACTIVE' }}
        planningArtifacts={[]}
        planningRequirements={[]}
        planningEvents={[PLANNING_EVENT]}
      />,
    )

    fireEvent.click(screen.getByRole('tab', { name: 'Activity' }))

    expect(screen.getByText('1 planning events')).toBeInTheDocument()
    expect(screen.getByText(/planning artifact resolved/)).toBeInTheDocument()
    expect(screen.queryByText(/canonical operational Event/)).not.toBeInTheDocument()
  })
})
