import { type Run, type Project, type Task } from '../api'

export interface RunHeaderProps {
  run: Run
  project?: Project | null
  task?: Task | null
}

export function RunHeader({ run, project, task }: RunHeaderProps) {
  const shortId = run.id.slice(0, 8)
  const started = new Date(run.created_at).toLocaleString()

  const runBadgeClass = (status: string) => {
    switch (status.toUpperCase()) {
      case 'RUNNING': return 'badge-running'
      case 'COMPLETED':
      case 'SUCCEEDED': return 'badge-success'
      case 'FAILED': return 'badge-failed'
      case 'CANCELLED': return 'badge-cancelled'
      default: return 'badge-neutral'
    }
  }

  return (
    <div className="run-header panel" style={{ marginBottom: '1.5rem', padding: '1rem' }}>
      <div>
        <h2 style={{ margin: 0 }}>Run #{shortId}</h2>
        <div style={{ fontSize: '1.25rem', fontWeight: 600, marginTop: '0.25rem' }}>
          {task?.title ?? 'Unknown Task'}
        </div>
      </div>
      
      <div style={{ display: 'flex', gap: '2rem', marginTop: '1.5rem', fontSize: '0.875rem' }}>
        <div>
          <div style={{ color: 'var(--text-secondary)' }}>Project</div>
          <div style={{ fontWeight: 500 }}>{project?.name ?? run.project_id}</div>
        </div>
        <div>
          <div style={{ color: 'var(--text-secondary)' }}>State</div>
          <div><span className={`badge ${runBadgeClass(run.status)}`}>{run.status}</span></div>
        </div>
        <div>
          <div style={{ color: 'var(--text-secondary)' }}>Workflow</div>
          <div style={{ fontWeight: 500 }}>{task?.requested_workflow_id ?? 'Default'}</div>
        </div>
        <div>
          <div style={{ color: 'var(--text-secondary)' }}>Started</div>
          <div style={{ fontWeight: 500 }}>{started}</div>
        </div>
        <div>
          <div style={{ color: 'var(--text-secondary)' }}>Primary executor</div>
          <div style={{ fontWeight: 500 }}>{run.requested_executor_id ?? 'Default'}</div>
        </div>
      </div>
    </div>
  )
}
