import { useEffect, useState } from 'react'
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
import { RunDetailPage } from '../pages/RunDetailPage'
import { ProjectDetailPage } from '../pages/ProjectDetailPage'
import { RunOfficePage } from '../pages/RunOfficePage'
import { OfficeWorkspacePage } from '../pages/OfficeWorkspacePage'
import { ProjectKpiPage } from '../pages/ProjectKpiPage'
import { DecisionCenterPage } from '../pages/DecisionCenterPage'
import { TaskDecisionPage } from '../pages/TaskDecisionPage'

export function AppShell() {
  const { currentPath } = useRouter()
  const [isNavOpen, setIsNavOpen] = useState(false)
  const isOfficeFocus =
    currentPath === '/office' || /^\/runs\/[^/]+\/office$/.test(currentPath)

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isNavOpen) {
        setIsNavOpen(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isNavOpen])

  const renderContent = () => {
    if (currentPath.startsWith('/projects/')) {
      const parts = currentPath.split('/')
      if (parts.length === 3) {
        return <ProjectDetailPage projectId={parts[2]} />
      }
    }

    if (currentPath.startsWith('/tasks/')) {
      const parts = currentPath.split('/')
      if (parts.length === 3) {
        return <TaskDecisionPage taskId={parts[2]} />
      }
    }

    if (currentPath.startsWith('/runs/')) {
      const parts = currentPath.split('/')
      if (parts.length === 4 && parts[3] === 'office') {
        return <RunOfficePage runId={parts[2]} />
      }
      if (parts.length === 3) {
        return <RunDetailPage runId={parts[2]} />
      }
    }

    switch (currentPath) {
      case '/inbox':
        return <DecisionCenterPage mode="inbox" />
      case '/board':
        return <DecisionCenterPage mode="board" />
      case '/office':
        return <OfficeWorkspacePage />
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
      case '/kpi':
        return <ProjectKpiPage />
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
    <div className={`app-shell ${isOfficeFocus ? 'office-shell-focus' : ''}`}>
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      <Navigation isOpen={isNavOpen} onClose={() => setIsNavOpen(false)} />

      <div className="app-layout">
        <Header
          isNavOpen={isNavOpen}
          onToggleNav={() => setIsNavOpen((previous) => !previous)}
        />

        <main id="main-content" className="app-main" tabIndex={-1}>
          {renderContent()}
        </main>
      </div>
    </div>
  )
}
