import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import {
  api,
  type AgentProfile,
  type CreateTaskRequest,
  type Project,
  type Run,
  type Task,
} from '../api'
import { Link } from '../router/Link'
import { useRouter } from '../router/useRouter'
import { NAV_ITEMS } from '../types/navigation'
import { CreateTaskModal } from './CreateTaskModal'

export interface HeaderProps {
  onToggleNav: () => void
  isNavOpen: boolean
  initialStatus?: 'checking' | 'connected' | 'disconnected'
}

type SearchKind = 'Task' | 'Run' | 'Agent'

interface SearchResult {
  id: string
  kind: SearchKind
  label: string
  meta: string
  path: string
  searchText: string
}

const PRIMARY_NAV_IDS = ['office', 'board', 'inbox', 'kpi', 'projects'] as const
const PRIMARY_NAV_ID_SET = new Set<string>(PRIMARY_NAV_IDS)

function shortId(value: string): string {
  return value.slice(0, 8)
}

function projectArray(value: unknown): Project[] {
  return Array.isArray(value) ? (value as Project[]) : []
}

export function Header({
  onToggleNav,
  isNavOpen,
  initialStatus,
}: HeaderProps) {
  const { currentPath, navigate } = useRouter()
  const [status, setStatus] = useState<
    'checking' | 'connected' | 'disconnected'
  >(initialStatus ?? 'checking')
  const [lastCheckedAt, setLastCheckedAt] = useState<number | null>(null)
  const [clockNow, setClockNow] = useState(0)
  const [projects, setProjects] = useState<Project[]>([])
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [isSearchLoading, setIsSearchLoading] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const searchIndexRef = useRef<SearchResult[] | null>(null)
  const searchLoadRef = useRef<Promise<SearchResult[]> | null>(null)

  const primaryItems = useMemo(
    () =>
      PRIMARY_NAV_IDS.flatMap((id) => {
        const item = NAV_ITEMS.find((candidate) => candidate.id === id)
        return item ? [item] : []
      }),
    [],
  )
  const secondaryItems = useMemo(
    () => NAV_ITEMS.filter((item) => !PRIMARY_NAV_ID_SET.has(item.id)),
    [],
  )
  const secondaryRouteActive = secondaryItems.some(
    (item) => item.path === currentPath,
  )

  const checkHealth = useCallback(async () => {
    setStatus('checking')

    try {
      const response = await api.getHealth()
      setStatus(response.status === 'ok' ? 'connected' : 'disconnected')
    } catch {
      setStatus('disconnected')
    } finally {
      const checkedAt = Date.now()
      setLastCheckedAt(checkedAt)
      setClockNow(checkedAt)
    }
  }, [])

  useEffect(() => {
    if (initialStatus !== undefined) {
      return
    }

    let active = true

    const pollHealth = async (showChecking: boolean) => {
      if (showChecking && active) setStatus('checking')

      try {
        const response = await api.getHealth()
        if (active) {
          setStatus(response.status === 'ok' ? 'connected' : 'disconnected')
        }
      } catch {
        if (active) setStatus('disconnected')
      } finally {
        if (active) {
          const checkedAt = Date.now()
          setLastCheckedAt(checkedAt)
          setClockNow(checkedAt)
        }
      }
    }

    void pollHealth(true)
    const healthTimer = window.setInterval(() => {
      void pollHealth(false)
    }, 12_000)
    const ageTimer = window.setInterval(() => {
      setClockNow(Date.now())
    }, 1_000)

    return () => {
      active = false
      window.clearInterval(healthTimer)
      window.clearInterval(ageTimer)
    }
  }, [initialStatus])

  const buildSearchIndex = useCallback(async (): Promise<SearchResult[]> => {
    if (searchIndexRef.current) return searchIndexRef.current
    if (searchLoadRef.current) return searchLoadRef.current

    const load = (async () => {
      const loadedProjects =
        projects.length > 0
          ? projects
          : await api
              .listProjects()
              .then(projectArray)
              .catch(() => [] as Project[])
      if (projects.length === 0 && loadedProjects.length > 0) {
        setProjects(loadedProjects)
      }

      const projectName = new Map(
        loadedProjects.map((project) => [project.id, project.name]),
      )
      const taskGroups = await Promise.all(
        loadedProjects.map((project) =>
          api.listTasks(project.id).catch(() => [] as Task[]),
        ),
      )
      const tasks = taskGroups.flat()
      const runGroups = await Promise.all(
        tasks.map((task) => api.listRuns(task.id).catch(() => [] as Run[])),
      )
      const runs = runGroups.flat()
      const profiles = await api
        .listAgentProfiles()
        .catch(() => [] as AgentProfile[])
      const taskById = new Map(tasks.map((task) => [task.id, task]))

      const index: SearchResult[] = [
        ...tasks.map((task) => {
          const meta = `${projectName.get(task.project_id) ?? 'Project'} · ${shortId(task.id)}`
          return {
            id: `task:${task.id}`,
            kind: 'Task' as const,
            label: task.title,
            meta,
            path: `/tasks/${task.id}`,
            searchText: `${task.title} ${task.id} ${task.objective} ${meta}`.toLowerCase(),
          }
        }),
        ...runs.map((run) => {
          const task = taskById.get(run.task_id)
          const label = `Run ${shortId(run.id)}`
          const meta = `${task?.title ?? 'Task'} · ${run.status}`
          return {
            id: `run:${run.id}`,
            kind: 'Run' as const,
            label,
            meta,
            path: `/runs/${run.id}`,
            searchText: `${label} ${run.id} ${meta}`.toLowerCase(),
          }
        }),
        ...profiles.map((profile) => {
          const meta = profile.key
          return {
            id: `agent:${profile.id}`,
            kind: 'Agent' as const,
            label: profile.name,
            meta,
            path: '/agents',
            searchText:
              `${profile.name} ${profile.key} ${profile.description}`.toLowerCase(),
          }
        }),
      ]

      searchIndexRef.current = index
      return index
    })()

    searchLoadRef.current = load
    try {
      return await load
    } finally {
      searchLoadRef.current = null
    }
  }, [projects])

  useEffect(() => {
    const normalized = query.trim().toLowerCase()
    if (normalized.length < 2) {
      setSearchResults([])
      setSearchError(null)
      return
    }

    let active = true
    setIsSearchLoading(true)
    setSearchError(null)

    void buildSearchIndex()
      .then((index) => {
        if (!active) return
        setSearchResults(
          index.filter((item) => item.searchText.includes(normalized)).slice(0, 8),
        )
      })
      .catch(() => {
        if (!active) return
        setSearchResults([])
        setSearchError('Search data is temporarily unavailable.')
      })
      .finally(() => {
        if (active) setIsSearchLoading(false)
      })

    return () => {
      active = false
    }
  }, [buildSearchIndex, query])

  const checkedAgeSeconds =
    lastCheckedAt === null
      ? null
      : Math.max(0, Math.floor((clockNow - lastCheckedAt) / 1_000))

  const statusText =
    status === 'connected'
      ? 'Backend online'
      : status === 'checking'
        ? 'Checking backend'
        : 'Backend offline'

  const createTask = (projectId: string, data: CreateTaskRequest) =>
    api.createTask(projectId, data)

  const openNewTask = () => {
    setIsTaskModalOpen(true)
    if (projects.length > 0) return

    void api
      .listProjects()
      .then((loaded) => setProjects(projectArray(loaded)))
      .catch(() => setProjects([]))
  }

  const closeSearch = () => {
    setQuery('')
    setSearchResults([])
    setSearchError(null)
  }

  return (
    <>
      <header className="app-header target-topbar" role="banner">
        <div className="target-topbar-brand-group">
          <button
            type="button"
            className="nav-toggle-btn"
            onClick={onToggleNav}
            aria-label="Toggle navigation menu"
            aria-expanded={isNavOpen}
          >
            <span className="nav-toggle-bar" />
            <span className="nav-toggle-bar" />
            <span className="nav-toggle-bar" />
          </button>

          <Link href="/office" className="target-brand">
            <span className="target-brand-mark" aria-hidden="true">AO</span>
            <strong>Agent Office</strong>
          </Link>
        </div>

        <nav className="target-primary-nav" aria-label="Primary Navigation">
          <span className="sr-only">Core</span>
          {primaryItems.map((item) => (
            <Link
              key={item.id}
              href={item.path}
              className="target-primary-link"
              activeClassName="active"
            >
              {item.label === 'Task Board' ? 'Board' : item.label === 'Project KPI' ? 'KPI' : item.label}
            </Link>
          ))}

          <details className="target-more-menu" open={secondaryRouteActive ? true : undefined}>
            <summary>
              <span className="sr-only">More tools</span>
              <span aria-hidden="true">More</span>
            </summary>
            <div className="target-more-popover">
              {secondaryItems.map((item) => (
                <Link
                  key={item.id}
                  href={item.path}
                  className="target-more-link"
                  activeClassName="active"
                  aria-label={item.label}
                >
                  <strong>{item.label}</strong>
                  <span>{item.description}</span>
                </Link>
              ))}
            </div>
          </details>
        </nav>

        <div className="target-topbar-actions">
          <div className="target-search" role="search">
            <label className="sr-only" htmlFor="global-target-search">
              Search tasks, runs, and agents
            </label>
            <input
              id="global-target-search"
              type="search"
              value={query}
              autoComplete="off"
              placeholder="Search tasks, runs, agents…"
              aria-expanded={query.trim().length >= 2}
              aria-controls="global-target-search-results"
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') closeSearch()
              }}
            />
            {query.trim().length >= 2 && (
              <div
                id="global-target-search-results"
                className="target-search-results"
                role="listbox"
                aria-label="Search results"
              >
                {isSearchLoading ? (
                  <span className="target-search-state">Searching…</span>
                ) : searchError ? (
                  <span className="target-search-state">{searchError}</span>
                ) : searchResults.length === 0 ? (
                  <span className="target-search-state">No matching records</span>
                ) : (
                  searchResults.map((result) => (
                    <button
                      key={result.id}
                      type="button"
                      className="target-search-result"
                      role="option"
                      aria-selected="false"
                      onClick={() => {
                        closeSearch()
                        navigate(result.path)
                      }}
                    >
                      <span>{result.kind}</span>
                      <strong>{result.label}</strong>
                      <small>{result.meta}</small>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          <button
            type="button"
            className="btn btn-primary target-new-task"
            onClick={openNewTask}
          >
            + New Task
          </button>

          <div
            className={`target-health ${status}`}
            role="status"
            aria-live="polite"
            title={
              checkedAgeSeconds === null
                ? statusText
                : `${statusText}; checked ${checkedAgeSeconds}s ago`
            }
          >
            <span className={`status-dot ${status}`} aria-hidden="true" />
            <span className="sr-only">{statusText}</span>
            <span className="sr-only">
              {checkedAgeSeconds === null
                ? 'Not checked yet'
                : `checked ${checkedAgeSeconds}s ago`}
            </span>
            {status === 'disconnected' && (
              <button
                type="button"
                onClick={checkHealth}
                aria-label="Retry backend health check"
              >
                Retry
              </button>
            )}
          </div>

          <div className="target-local-owner" title="Local owner" aria-label="Local owner">
            <span aria-hidden="true">LO</span>
          </div>
        </div>
      </header>

      <CreateTaskModal
        isOpen={isTaskModalOpen}
        projects={projects}
        onClose={() => setIsTaskModalOpen(false)}
        onCreate={createTask}
        onSuccess={(task) => navigate(`/tasks/${task.id}`)}
      />
    </>
  )
}
