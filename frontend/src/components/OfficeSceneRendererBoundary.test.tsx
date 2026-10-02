import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { OfficeSceneRendererBoundary } from './OfficeSceneRendererBoundary'

function BrokenRenderer(): never {
  throw new Error('synthetic renderer failure')
}

describe('OfficeSceneRendererBoundary', () => {
  it('falls back to the legacy renderer when the R3F tree throws', () => {
    const originalError = console.error
    console.error = () => undefined

    try {
      render(
        <OfficeSceneRendererBoundary
          resetKey="planning:live:build:0"
          fallback={<div>Three.js fallback renderer</div>}
        >
          <BrokenRenderer />
        </OfficeSceneRendererBoundary>,
      )

      expect(
        screen.getByText('Three.js fallback renderer'),
      ).toBeInTheDocument()
    } finally {
      console.error = originalError
    }
  })
})
