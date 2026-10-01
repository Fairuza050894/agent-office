import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import {
  ContextualOperationsRail,
  TaskQuickCreate,
} from './ContextualOperationsRail'

describe('ContextualOperationsRail', () => {
  it('switches between discussion, details, files, and logs without mixing surfaces', () => {
    render(
      <ContextualOperationsRail
        eyebrow="Selected AgentRun"
        title="Backend Developer"
        status="RUNNING"
        collapsed={false}
        onToggleCollapsed={() => undefined}
        discussion={<div>Discussion truth</div>}
        details={<div>Detail truth</div>}
        files={<div>File truth</div>}
        logs={<div>Log truth</div>}
      />,
    )

    const rail = screen.getByRole('complementary', {
      name: 'Contextual Operations Rail',
    })
    expect(within(rail).getByText('Discussion truth')).toBeInTheDocument()

    fireEvent.click(within(rail).getByRole('tab', { name: 'Details' }))
    expect(within(rail).getByText('Detail truth')).toBeInTheDocument()
    expect(within(rail).queryByText('Discussion truth')).not.toBeInTheDocument()

    fireEvent.click(within(rail).getByRole('tab', { name: 'Files' }))
    expect(within(rail).getByText('File truth')).toBeInTheDocument()

    fireEvent.click(within(rail).getByRole('tab', { name: 'Logs' }))
    expect(within(rail).getByText('Log truth')).toBeInTheDocument()
  })

  it('creates a task only after title and objective are provided', () => {
    const onCreate = vi.fn()

    render(<TaskQuickCreate onCreate={onCreate} />)

    const submit = screen.getByRole('button', { name: 'Add task' })
    expect(submit).toBeDisabled()

    fireEvent.change(screen.getByPlaceholderText('Short actionable task'), {
      target: { value: 'Add artifact preview' },
    })
    fireEvent.change(screen.getByPlaceholderText('What must be accomplished?'), {
      target: { value: 'Expose bounded artifact content through the API.' },
    })

    expect(submit).toBeEnabled()
    fireEvent.click(submit)

    expect(onCreate).toHaveBeenCalledWith({
      title: 'Add artifact preview',
      objective: 'Expose bounded artifact content through the API.',
    })
  })

  it('hides optional views when canonical data is unavailable', () => {
    render(
      <ContextualOperationsRail
        eyebrow="Planning"
        title="Agent Office"
        collapsed={false}
        onToggleCollapsed={() => undefined}
        discussion={<div>Discussion remains available</div>}
        details={null}
        files={null}
        logs={null}
      />,
    )

    expect(screen.getByRole('tab', { name: 'Discussion' })).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Details' })).not.toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Files' })).not.toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Logs' })).not.toBeInTheDocument()
  })

  it('renders a compact reopen control when collapsed', () => {
    const onToggle = vi.fn()

    render(
      <ContextualOperationsRail
        eyebrow="Project workspace"
        title="Agent Office"
        collapsed
        onToggleCollapsed={onToggle}
        discussion={null}
        details={null}
        files={null}
        logs={null}
      />,
    )

    fireEvent.click(
      screen.getByRole('button', { name: 'Open contextual operations' }),
    )
    expect(onToggle).toHaveBeenCalledTimes(1)
  })
})
