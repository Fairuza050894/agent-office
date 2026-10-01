import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { Executor, Project } from '../../api'
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

describe('UniversalComposerShell Phase 10H-1 structure', () => {
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
})
