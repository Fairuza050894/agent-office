import {
  act,
  fireEvent,
  render,
  screen,
} from '@testing-library/react'
import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

import { Router } from '../router/Router'
import { Header } from './Header'

function jsonResponse(
  body: unknown,
  status = 200,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('backend reachability indicator', () => {
  it('reports only that the backend is reachable when health succeeds', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse({ status: 'ok' }),
        ),
    )

    render(
      <Router initialPath="/overview">
        <Header isNavOpen={false} onToggleNav={() => undefined} />
      </Router>,
    )

    expect(
      await screen.findByText(
        'Backend online',
      ),
    ).toBeInTheDocument()

    expect(
      screen.getByText(/checked \d+s ago/),
    ).toBeInTheDocument()
  })

  it('polls health and downgrades a previously healthy backend when the next check fails', async () => {
    let healthPoll: (() => void) | null = null
    vi.spyOn(window, 'setInterval').mockImplementation(
      (handler: TimerHandler, timeout?: number) => {
        if (timeout === 12_000 && typeof handler === 'function') {
          healthPoll = handler as () => void
        }
        return 1
      },
    )

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ status: 'ok' }))
      .mockRejectedValueOnce(new Error('backend unreachable'))

    vi.stubGlobal('fetch', fetchMock)

    render(
      <Router initialPath="/overview">
        <Header isNavOpen={false} onToggleNav={() => undefined} />
      </Router>,
    )

    expect(await screen.findByText('Backend online')).toBeInTheDocument()
    expect(healthPoll).not.toBeNull()

    await act(async () => {
      healthPoll?.()
      await Promise.resolve()
    })

    expect(await screen.findByText('Backend offline')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('reports disconnection and provides an accessible retry control', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(
        new Error('offline'),
      )
      .mockResolvedValueOnce(
        jsonResponse({ status: 'ok' }),
      )

    vi.stubGlobal('fetch', fetchMock)

    render(
      <Router initialPath="/overview">
        <Header isNavOpen={false} onToggleNav={() => undefined} />
      </Router>,
    )

    expect(
      await screen.findByText(
        'Backend offline',
      ),
    ).toBeInTheDocument()

    const retry = screen.getByRole('button', {
      name: 'Retry backend health check',
    })

    fireEvent.click(retry)

    expect(
      await screen.findByText(
        'Backend online',
      ),
    ).toBeInTheDocument()

    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
