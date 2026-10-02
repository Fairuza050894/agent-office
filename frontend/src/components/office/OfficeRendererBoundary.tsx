import {
  Component,
  type ErrorInfo,
  type ReactNode,
} from 'react'

interface OfficeRendererBoundaryProps {
  children: ReactNode
  fallback: ReactNode
  resetKey: string
}

interface OfficeRendererBoundaryState {
  failed: boolean
}

export class OfficeRendererBoundary extends Component<
  OfficeRendererBoundaryProps,
  OfficeRendererBoundaryState
> {
  state: OfficeRendererBoundaryState = {
    failed: false,
  }

  static getDerivedStateFromError(): OfficeRendererBoundaryState {
    return {
      failed: true,
    }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error(
      'Agent Office R3F renderer failed; falling back to Three.js',
      error,
      errorInfo,
    )
  }

  componentDidUpdate(
    previousProps: OfficeRendererBoundaryProps,
  ): void {
    if (
      this.state.failed &&
      previousProps.resetKey !== this.props.resetKey
    ) {
      this.setState({ failed: false })
    }
  }

  render() {
    return this.state.failed
      ? this.props.fallback
      : this.props.children
  }
}
