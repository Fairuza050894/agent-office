import { useState, useEffect } from 'react'
import { api, type Evidence } from '../api'
import { TableShell } from './TableShell'

export interface RunEvidenceTabProps {
  runId: string
}

export function RunEvidenceTab({ runId }: RunEvidenceTabProps) {
  const [evidenceList, setEvidenceList] = useState<Evidence[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let active = true
    const load = async () => {
      try {
        const loaded = await api.getRunEvidence(runId)
        if (!active) return
        setEvidenceList(loaded)
        setIsLoading(false)
      } catch {
        if (!active) return
        setIsLoading(false)
      }
    }
    void load()
    return () => {
      active = false
    }
  }, [runId])

  if (isLoading) {
    return <div className="status-feedback"><span className="status-spinner"/> Loading evidence...</div>
  }

  const columns = ['Kind', 'Status', 'Summary', 'Created']

  const renderBody = () => {
    if (evidenceList.length === 0) {
      return (
        <tr>
          <td colSpan={columns.length} className="table-empty-cell">
            No evidence recorded for this run.
          </td>
        </tr>
      )
    }

    return evidenceList.map(ev => (
      <tr key={ev.id}>
        <td>{ev.kind}</td>
        <td><span className="badge badge-neutral">{ev.status}</span></td>
        <td>{ev.summary}</td>
        <td className="cell-nowrap">{new Date(ev.created_at).toLocaleString()}</td>
      </tr>
    ))
  }

  return (
    <div className="run-evidence">
      <TableShell
        columns={columns}
        caption="Run Evidence"
        emptyTitle="No evidence"
        emptyMessage="No evidence recorded for this run."
      >
        {renderBody()}
      </TableShell>
    </div>
  )
}
