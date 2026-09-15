import { useState, useEffect } from 'react'
import { useRouter } from '../router/useRouter'
import { Navigation } from '../components/Navigation'
import { Header } from '../components/Header'
import { OverviewPage } from '../pages/OverviewPage'
import { ProjectsPage } from '../pages/ProjectsPage'
import { RunsPage } from '../pages/RunsPage'
import { TasksPage } from '../pages/TasksPage'
import { AgentsPage } from '../pages/AgentsPage'
import { WorkflowsPage } from '../pages/WorkflowsPage'
import { ExecutorsPage } from '../pages/ExecutorsPage'
import { ActivityPage } from '../pages/ActivityPage'
import { EvidencePage } from '../pages/EvidencePage'
import { AuditPage } from '../pages/AuditPage'
import { SettingsPage } from '../pages/SettingsPage'
import { NotFoundPage } from '../pages/NotFoundPage'

export function AppShell() {
  const { currentPath } = useRouter()
  const [isNavOpen, setIsNavOpen] = useState(false)

  // Close drawer on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isNavOpen) {
        setIsNavOpen(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isNavOpen])

  const renderContent = () => {
    switch (currentPath) {
      case '/overview':
        return <OverviewPage />
      case '/projects':
        return <ProjectsPage />
      case '/runs':
        return <RunsPage />
      case '/tasks':
        return <TasksPage />
      case '/agents':
        return <AgentsPage />
      case '/workflows':
        return <WorkflowsPage />
      case '/executors':
        return <ExecutorsPage />
      case '/activity':
        return <ActivityPage />
      case '/evidence':
        return <EvidencePage />
      case '/audit':
        return <AuditPage />
      case '/settings':
        return <SettingsPage />
      default:
        return <NotFoundPage />
    }
  }

  return (
    <div className="app-shell">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      <Navigation
        isOpen={isNavOpen}
        onClose={() => setIsNavOpen(false)}
      />

      <div className="app-layout">
        <Header
          isNavOpen={isNavOpen}
          onToggleNav={() => setIsNavOpen((prev) => !prev)}
        />

        <main id="main-content" className="app-main" tabIndex={-1}>
          {renderContent()}
        </main>
      </div>
    </div>
  )
}
