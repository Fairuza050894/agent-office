import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { ComposerThread, Executor, Project } from '../../api'
import { UniversalComposerShell } from './UniversalComposerShell'

const PROJECT: Project = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Agent Office',
  repository: { name: 'agent-office' },
  default_branch: 'main',
  preferred_executor_id: null,
  default_workflow_id: null,
  status: 'ACTIVE',
  created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-01T00:00:00Z',
  archived_at: null,
}

const EXECUTOR: Executor = {
  id: '22222222-2222-4222-8222-222222222222',
  kind: 'REFERENCE',
  name: 'Reference Executor',
  status: 'AVAILABLE',
  runtime_version: '1',
  health_summary: 'Available.',
  last_check: '2026-10-01T00:00:00Z',
  capabilities: [],
  security_limitations: [],
}

const EXECUTOR_2: Executor = {
  ...EXECUTOR,
  id: '33333333-3333-4333-8333-333333333333',
  name: 'Codex Executor',
}

function thread(overrides: Partial<ComposerThread>): ComposerThread {
  return {
    id: '44444444-4444-4444-8444-444444444444',
    project_id: PROJECT.id,
    title: 'Planning thread',
    requested_intent: 'AUTO',
    resolved_intent: 'PLAN',
    status: 'ACTIVE',
    timezone: 'Asia/Jakarta',
    executor_id: EXECUTOR.id,
    workflow_id: null,
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-01T00:00:00Z',
    completed_at: null,
    ...overrides,
  }
}

describe('UniversalComposerShell Phase 19 structure', () => {
  it('reviews RUN intent through planning instead of exposing a direct Start Run action', () => {
    const onSubmit = vi.fn()

    render(
      <UniversalComposerShell
        projects={[PROJECT]}
        selectedProjectId={PROJECT.id}
        executors={[EXECUTOR]}
        selectedExecutorId={EXECUTOR.id}
        onSubmit={onSubmit}
      />,
    )

    const composer = screen.getByRole('region', { name: 'Universal Composer' })
    fireEvent.change(within(composer).getByLabelText('Composer intent'), {
      target: { value: 'RUN' },
    })
    fireEvent.change(within(composer).getByLabelText('Ask Agent Office'), {
      target: { value: 'Implement the approved bounded change.' },
    })

    const review = within(composer).getByRole('button', { name: 'Review run' })
    expect(review).toBeEnabled()
    expect(
      within(composer).queryByRole('button', { name: 'Start Run' }),
    ).not.toBeInTheDocument()

    fireEvent.click(review)

    expect(onSubmit).toHaveBeenCalledWith({
      intent: 'RUN',
      instruction: 'Implement the approved bounded change.',
      executorId: EXECUTOR.id,
    })
  })

  it('keeps secondary context before the composer input in document order', () => {
    render(
      <UniversalComposerShell
        projects={[PROJECT]}
        selectedProjectId={PROJECT.id}
        executors={[EXECUTOR]}
        selectedExecutorId={EXECUTOR.id}
      />,
    )

    const composer = screen.getByRole('region', { name: 'Universal Composer' })
    const context = within(composer).getByText('Context').closest('summary')
    const input = within(composer).getByLabelText('Ask Agent Office')

    expect(context).not.toBeNull()
    expect(
      (context as HTMLElement).compareDocumentPosition(input) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it('re-syncs AUTO intent and preferred executor when project/thread context changes', () => {
    const { rerender } = render(
      <UniversalComposerShell
        projects={[PROJECT]}
        selectedProjectId={PROJECT.id}
        executors={[EXECUTOR, EXECUTOR_2]}
        selectedExecutorId={EXECUTOR.id}
      />,
    )

    expect(screen.getByLabelText('Composer intent')).toHaveValue('AUTO')
    expect(screen.getByLabelText('Composer executor')).toHaveValue(EXECUTOR.id)

    rerender(
      <UniversalComposerShell
        projects={[PROJECT]}
        selectedProjectId={PROJECT.id}
        executors={[EXECUTOR, EXECUTOR_2]}
        selectedExecutorId={EXECUTOR_2.id}
        activeThread={thread({
          id: '55555555-5555-4555-8555-555555555555',
          requested_intent: 'BRAINSTORM',
          executor_id: EXECUTOR_2.id,
        })}
      />,
    )

    expect(screen.getByLabelText('Composer intent')).toHaveValue('BRAINSTORM')
    expect(screen.getByLabelText('Composer executor')).toHaveValue(EXECUTOR_2.id)
  })

  it('submits the default AUTO composer with Enter', () => {
    const onSubmit = vi.fn()

    render(
      <UniversalComposerShell
        projects={[PROJECT]}
        selectedProjectId={PROJECT.id}
        executors={[EXECUTOR]}
        selectedExecutorId={EXECUTOR.id}
        onSubmit={onSubmit}
      />,
    )

    const input = screen.getByLabelText('Ask Agent Office')
    fireEvent.change(input, {
      target: { value: 'Polish the accepted Office experience.' },
    })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(onSubmit).toHaveBeenCalledWith({
      intent: 'AUTO',
      instruction: 'Polish the accepted Office experience.',
      executorId: EXECUTOR.id,
    })
  })

  it('keeps Shift+Enter available for multiline instructions', () => {
    const onSubmit = vi.fn()

    render(
      <UniversalComposerShell
        projects={[PROJECT]}
        selectedProjectId={PROJECT.id}
        executors={[EXECUTOR]}
        selectedExecutorId={EXECUTOR.id}
        onSubmit={onSubmit}
      />,
    )

    const input = screen.getByLabelText('Ask Agent Office')
    fireEvent.change(input, {
      target: { value: 'First outcome\nSecond constraint' },
    })
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true })

    expect(onSubmit).not.toHaveBeenCalled()
    expect(input).toHaveValue('First outcome\nSecond constraint')
  })
})
