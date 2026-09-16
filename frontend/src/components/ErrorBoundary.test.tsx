import { render, screen } from '@testing-library/react'
import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

import { ErrorBoundary } from './ErrorBoundary'

function BrokenComponent(): never {
  throw new Error('intentional render failure')
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('ErrorBoundary', () => {
  it('renders a safe fallback when a descendant fails', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})

    render(
      <ErrorBoundary>
        <BrokenComponent />
      </ErrorBoundary>,
    )

    expect(
      screen.getByRole('alert'),
    ).toBeInTheDocument()

    expect(
      screen.getByRole('heading', {
        name: 'Agent Office encountered an unexpected error',
      }),
    ).toBeInTheDocument()

    expect(
      screen.queryByText('intentional render failure'),
    ).not.toBeInTheDocument()
  })
})
