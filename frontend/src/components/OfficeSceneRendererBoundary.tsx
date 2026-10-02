import { Component, type ReactNode } from 'react'

interface OfficeSceneRendererBoundaryProps {
  children: ReactNode
  fallback: ReactNode
  resetKey: string
}

interface OfficeSceneRendererBoundaryState {
  failed: boolean
}

export class OfficeSceneRendererBoundary extends Component<
  OfficeSceneRendererBoundaryProps,
  OfficeSceneRendererBoundaryState
> {
  state: OfficeSceneRendererBoundaryState = { failed: false }

  static getDerivedStateFromError(): OfficeSceneRendererBoundaryState {
    return { failed: true }
  }

  componentDidUpdate(
    previousProps: OfficeSceneRendererBoundaryProps,
  ): void {
    if (
      this.state.failed &&
      previousProps.resetKey !== this.props.resetKey
    ) {
      this.setState({ failed: false })
    }
  }

  componentDidCatch(error: Error): void {
    console.error(
      'R3F Office renderer failed; falling back to Three.js:',
      error,
    )
  }

  render() {
    return this.state.failed
      ? this.props.fallback
      : this.props.children
  }
}
