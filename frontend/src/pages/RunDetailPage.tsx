import { useEffect, useState } from 'react'
import { api, type Project, type Run, type Task } from '../api'
import { EmptyState } from '../components/EmptyState'
import { PageHeader } from '../components/PageHeader'
import { RunActivityTab } from '../components/RunActivityTab'
import { RunAgentsTab } from '../components/RunAgentsTab'
import { RunChangesTab } from '../components/RunChangesTab'
import { RunEvidenceTab } from '../components/RunEvidenceTab'
import { RunFindingsTab } from '../components/RunFindingsTab'
import { RunHeader } from '../components/RunHeader'
import { RunOverviewTab } from '../components/RunOverviewTab'
import { RunTestsTab } from '../components/RunTestsTab'
import { RunWorkflowTab } from '../components/RunWorkflowTab'

export interface RunDetailPageProps {
  runId: string
}

type RunTab =
  | 'overview'
  | 'workflow'
  | 'agents'
  | 'activity'
  | 'changes'
  | 'tests'
  | 'findings'
  | 'evidence'

const TABS: Array<{ id: RunTab; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'workflow', label: 'Workflow' },
  { id: 'agents', label: 'Agents' },
  { id: 'activity', label: 'Activity' },
  { id: 'changes', label: 'Changes' },
  { id: 'tests', label: 'Tests' },
  { id: 'findings', label: 'Findings' },
  { id: 'evidence', label: 'Evidence' },
]

export function RunDetailPage({ runId }: RunDetailPageProps) {
  const [activeTab, setActiveTab] = useState<RunTab>('overview')
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
          api.getTask(loadedRun.task_id),
        ])
        if (!active) return
        setProject(loadedProject)
        setTask(loadedTask)
      } catch (err) {
        if (!active) return
        setError(err instanceof Error ? err.message : 'Failed to load run details.')
      } finally {
        if (active) setIsLoading(false)
      }
    }
    void load()
    return () => {
      active = false
    }
  }, [runId])

  if (isLoading) {
    return (
      <div className="page-view">
        <PageHeader title="Run Details" description="Loading canonical Run state..." />
        <div className="status-feedback" role="status">
          <span className="status-spinner" /> Loading run...
        </div>
      </div>
    )
  }

  if (error || !run) {
    return (
      <div className="page-view">
        <PageHeader title="Run Not Found" description="The Run could not be loaded." />
        <EmptyState
          title="Could not load Run"
          message={error || 'Run details are unavailable.'}
          detail="Return to the Run registry and select a persisted Run."
        />
      </div>
    )
  }

  return (
    <div className="page-view run-detail-view">
      <RunHeader
        run={run}
        project={project}
        task={task}
        onRunUpdated={setRun}
      />

      <div className="run-tabs" role="tablist" aria-label="Run detail">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            id={`run-tab-${tab.id}`}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-controls={`run-panel-${tab.id}`}
            className={`run-tab-button ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div
        id={`run-panel-${activeTab}`}
        role="tabpanel"
        aria-labelledby={`run-tab-${activeTab}`}
        className="run-tab-content"
      >
        {activeTab === 'overview' && <RunOverviewTab key={run.updated_at} run={run} />}
        {activeTab === 'workflow' && <RunWorkflowTab key={run.updated_at} runId={run.id} />}
        {activeTab === 'agents' && <RunAgentsTab key={run.updated_at} runId={run.id} />}
        {activeTab === 'activity' && <RunActivityTab key={run.updated_at} runId={run.id} />}
        {activeTab === 'changes' && <RunChangesTab key={run.updated_at} run={run} />}
        {activeTab === 'tests' && <RunTestsTab key={run.updated_at} runId={run.id} />}
        {activeTab === 'findings' && <RunFindingsTab key={run.updated_at} runId={run.id} />}
        {activeTab === 'evidence' && <RunEvidenceTab key={run.updated_at} runId={run.id} />}
      </div>
    </div>
  )
}
