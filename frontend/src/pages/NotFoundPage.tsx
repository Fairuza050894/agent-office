import { Link } from '../router/Link'
import { PageHeader } from '../components/PageHeader'
import { EmptyState } from '../components/EmptyState'

export function NotFoundPage() {
  return (
    <div className="page-view not-found-view">
      <PageHeader
        eyebrow="SYSTEM"
        title="Page Not Found"
        description="The requested route is not part of the Agent Office operations control plane."
      />

      <div className="page-content">
        <EmptyState
          title="Route does not exist"
          message="The requested path does not map to an operational surface."
        >
          <Link href="/overview" className="btn btn-primary">
            Return to Overview
          </Link>
        </EmptyState>
      </div>
    </div>
  )
}
