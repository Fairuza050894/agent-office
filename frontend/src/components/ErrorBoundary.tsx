import {
  Component,
  type ErrorInfo,
  type ReactNode,
} from 'react'

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
}

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = {
    hasError: false,
  }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return {
      hasError: true,
    }
  }

  componentDidCatch(
    error: Error,
    errorInfo: ErrorInfo,
  ): void {
    console.error(
      'Agent Office UI render failure',
      error,
      errorInfo,
    )
  }

  render() {
    if (this.state.hasError) {
      return (
        <main
          className="fatal-error"
          role="alert"
          aria-labelledby="fatal-error-title"
        >
          <h1 id="fatal-error-title">
            Agent Office encountered an unexpected error
          </h1>

          <p>
            The interface could not be rendered safely.
            Reload the application to retry.
          </p>
        </main>
      )
    }

    return this.props.children
  }
}
