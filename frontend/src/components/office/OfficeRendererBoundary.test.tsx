import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { OfficeRendererBoundary } from './OfficeRendererBoundary'

function ExplodingRenderer(): never {
  throw new Error('renderer failed')
}

describe('OfficeRendererBoundary', () => {
  it('falls back to the supplied renderer when R3F render fails', () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined)

    render(
      <OfficeRendererBoundary
        resetKey="build"
        fallback={<div>Three.js fallback</div>}
      >
        <ExplodingRenderer />
      </OfficeRendererBoundary>,
    )

    expect(
      screen.getByText('Three.js fallback'),
    ).toBeInTheDocument()
    expect(consoleError).toHaveBeenCalled()

    consoleError.mockRestore()
  })
})
