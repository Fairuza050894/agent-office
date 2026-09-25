import { useEffect, useMemo, useState } from 'react'
import { api, type Project, type WorkflowDefinition } from '../api'
import { EmptyState } from '../components/EmptyState'
import { PageHeader } from '../components/PageHeader'
import { TableShell } from '../components/TableShell'

export function WorkflowsPage() {
  const [workflows, setWorkflows] = useState<WorkflowDefinition[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    Promise.all([api.listWorkflows(), api.listProjects()])
      .then(([loadedWorkflows, loadedProjects]) => {
        if (!active) return
        setWorkflows(loadedWorkflows)
        setProjects(loadedProjects)
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : 'Workflow registry is unavailable.')
      })
      .finally(() => {
        if (active) setIsLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  const projectCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const project of projects) {
      if (project.default_workflow_id) {
        counts[project.default_workflow_id] = (counts[project.default_workflow_id] ?? 0) + 1
      }
    }
    return counts
  }, [projects])

  return (
    <div className="page-view workflows-view">
      <PageHeader
        eyebrow="ENGINEERING"
        title="Workflows"
        description="Versioned workflow definitions. Runs execute immutable WorkflowSnapshots."
      />
      <div className="page-content">
        {isLoading ? (
          <div className="status-feedback" role="status"><span className="status-spinner" /> Loading workflows...</div>
        ) : error ? (
          <div className="status-feedback" role="alert"><p className="status-error-text">{error}</p></div>
        ) : workflows.length === 0 ? (
          <EmptyState title="No workflow definitions loaded." message="No reusable workflow definitions are registered." detail="Built-in definitions are registered when workflow resolution is first required." />
        ) : (
          <TableShell columns={['Workflow', 'Version', 'Stages', 'Required roles', 'Checks', 'Status', 'Used by projects']} caption="Workflow definitions" emptyTitle="No workflows." emptyMessage="No workflows exist.">
            {workflows.map((workflow) => {
              const requiredRoles = [...new Set(workflow.stages.flatMap((stage) => stage.assignments.filter((assignment) => assignment.required).map((assignment) => assignment.profile_key)))]
              return (
                <tr key={workflow.id}>
                  <td><strong>{workflow.name}</strong><div className="cell-secondary"><code>{workflow.key}</code></div></td>
                  <td>{workflow.version}</td>
                  <td>{workflow.stages.length}</td>
                  <td className="cell-wrap">{requiredRoles.join(', ') || 'Unavailable'}</td>
                  <td>{workflow.verification_checks.length}</td>
                  <td><span className="badge badge-neutral">{workflow.status}</span></td>
                  <td>{projectCounts[workflow.id] ?? 0}</td>
                </tr>
              )
            })}
          </TableShell>
        )}
      </div>
    </div>
  )
}
