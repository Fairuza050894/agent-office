import { useEffect, useState } from 'react'
import { api, type Run, type Project, type Task } from '../api'
import { PageHeader } from '../components/PageHeader'
import { EmptyState } from '../components/EmptyState'
import { RunHeader } from '../components/RunHeader'
import { RunOverviewTab } from '../components/RunOverviewTab'
import { RunFindingsTab } from '../components/RunFindingsTab'
import { RunEvidenceTab } from '../components/RunEvidenceTab'
import { RunActivityTab } from '../components/RunActivityTab'

export interface RunDetailPageProps {
  runId: string
}

export function RunDetailPage({ runId }: RunDetailPageProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'findings' | 'evidence' | 'activity'>('overview')
  const [run, setRun] = useState<Run | null>(null)
  const [project, setProject] = useState<Project | null>(null)
  const [task, setTask] = useState<Task | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    const load = async () => {
      try {
        const loadedRun = await api.getRun(runId)
        if (!active) return
        setRun(loadedRun)
        
        const [loadedProject, loadedTask] = await Promise.all([
          api.getProject(loadedRun.project_id),
          api.getTask(loadedRun.task_id)
        ])
        if (!active) return
        setProject(loadedProject)
        setTask(loadedTask)
        
        setIsLoading(false)
      } catch (err) {
        if (!active) return
        setError(err instanceof Error ? err.message : 'Failed to load run details')
        setIsLoading(false)
      }
    }
    void load()
    return () => {
      active = false
    }
  }, [runId])

  if (isLoading) {
    return (
      <div className="page-container">
        <PageHeader title="Run Details" description="Loading..." />
        <div className="status-feedback">
          <span className="status-spinner" /> Loading run...
        </div>
      </div>
    )
  }

  if (error || !run) {
    return (
      <div className="page-container">
        <PageHeader title="Run Not Found" description="The run could not be loaded." />
        <EmptyState
          title="Could not load run"
          message={error || 'Run details are unavailable.'}
        />
      </div>
    )
  }

  return (
    <div className="page-container">
      <RunHeader run={run} project={project} task={task} />
      
      <div className="tabs" style={{ display: 'flex', gap: '1rem', borderBottom: '1px solid var(--border-color)', marginBottom: '1.5rem' }}>
        {(['overview', 'findings', 'evidence', 'activity'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: '0.5rem 1rem',
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              borderBottom: activeTab === tab ? '2px solid var(--primary-color)' : '2px solid transparent',
              fontWeight: activeTab === tab ? 600 : 400,
              textTransform: 'capitalize',
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="tab-content">
        {activeTab === 'overview' && <RunOverviewTab runId={run.id} />}
        {activeTab === 'findings' && <RunFindingsTab runId={run.id} />}
        {activeTab === 'evidence' && <RunEvidenceTab runId={run.id} />}
        {activeTab === 'activity' && <RunActivityTab runId={run.id} />}
      </div>
    </div>
  )
}
