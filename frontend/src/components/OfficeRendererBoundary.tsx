import { Component, type ReactNode } from 'react'

interface OfficeRendererBoundaryProps {
  children: ReactNode
  operationalHref: string
}

interface OfficeRendererBoundaryState {
  failed: boolean
}

export class OfficeRendererBoundary extends Component<
  OfficeRendererBoundaryProps,
  OfficeRendererBoundaryState
> {
  state: OfficeRendererBoundaryState = { failed: false }

  static getDerivedStateFromError(): OfficeRendererBoundaryState {
    return { failed: true }
  }

  render() {
    if (this.state.failed) {
      return (
        <div className="office-renderer-fallback" role="alert">
          <strong>Office renderer unavailable</strong>
          <p>
            The visual projection failed locally. Canonical Run state and workflow
            execution remain independent from Office View.
          </p>
          <a href={this.props.operationalHref}>Open operational Run</a>
        </div>
      )
    }

    return this.props.children
  }
}
