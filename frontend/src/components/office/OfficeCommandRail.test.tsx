import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { OfficeCommandRail } from './OfficeCommandRail'

describe('OfficeCommandRail', () => {
  it('renders factual mission-control context without changing action semantics', () => {
    render(
      <OfficeCommandRail
        title="Agent Office"
        projectName="TDP"
        modeLabel="PLAN"
        statusLabel="2 active work assignments"
        meta="3 Projects"
        actions={<button type="button">Maximize</button>}
      />,
    )

    const rail = screen.getByRole('banner', { name: 'Agent Office command rail' })
    expect(within(rail).getByRole('heading', { name: 'Agent Office' })).toBeInTheDocument()
    expect(within(rail).getByText('TDP')).toBeInTheDocument()
    expect(within(rail).getByText('PLAN')).toBeInTheDocument()
    expect(within(rail).getByRole('status')).toHaveTextContent('2 active work assignments')
    expect(within(rail).getByText('3 Projects')).toBeInTheDocument()
    expect(within(rail).getByRole('button', { name: 'Maximize' })).toBeInTheDocument()
  })
})
