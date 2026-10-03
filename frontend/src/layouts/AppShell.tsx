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
import { RunDetailPage } from '../pages/RunDetailPage'
import { ProjectDetailPage } from '../pages/ProjectDetailPage'
import { RunOfficePage } from '../pages/RunOfficePage'
import { OfficeWorkspacePage } from '../pages/OfficeWorkspacePage'
import { ProjectKpiPage } from '../pages/ProjectKpiPage'

const OFFICE_SIDEBAR_STORAGE_KEY = 'agent-office.office-sidebar-collapsed'

function readOfficeSidebarCollapsed(): boolean {
  if (typeof window === 'undefined') return false

  try {
    const stored = window.localStorage.getItem(OFFICE_SIDEBAR_STORAGE_KEY)
    return stored === null ? true : stored === 'true'
  } catch {
    return true
  }
}

function storeOfficeSidebarCollapsed(collapsed: boolean): void {
  try {
    window.localStorage.setItem(OFFICE_SIDEBAR_STORAGE_KEY, String(collapsed))
  } catch {
    // Local storage is a convenience only; navigation remains fully usable without it.
  }
}

export function AppShell() {
  const { currentPath } = useRouter()
  const [isNavOpen, setIsNavOpen] = useState(false)
  const [isOfficeSidebarCollapsed, setIsOfficeSidebarCollapsed] = useState(
    readOfficeSidebarCollapsed,
  )
  const isOfficeFocus =
    currentPath === '/office' || /^\/runs\/[^/]+\/office$/.test(currentPath)
  const sidebarCollapsed = isOfficeFocus && isOfficeSidebarCollapsed

  const toggleOfficeSidebar = () => {
    setIsOfficeSidebarCollapsed((current) => {
      const next = !current
      storeOfficeSidebarCollapsed(next)
      return next
    })
  }

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
    if (currentPath.startsWith('/projects/')) {
      const parts = currentPath.split('/')
      if (parts.length === 3) {
        return <ProjectDetailPage projectId={parts[2]} />
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

      <Navigation
        isOpen={isNavOpen}
        onClose={() => setIsNavOpen(false)}
        isCollapsed={sidebarCollapsed}
        onToggleCollapsed={isOfficeFocus ? toggleOfficeSidebar : undefined}
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
