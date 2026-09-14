import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import App from './App'

describe('App', () => {
  it('renders the Agent Office foundation', () => {
    render(<App />)

    expect(
      screen.getByRole('heading', { name: 'Agent Office' }),
    ).toBeInTheDocument()

    expect(screen.getByText('Foundation ready.')).toBeInTheDocument()
  })
})
