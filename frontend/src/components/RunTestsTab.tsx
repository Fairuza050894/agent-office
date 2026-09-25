import { useEffect, useState } from 'react'
import { api, type VerificationStatus } from '../api'
import { EmptyState } from './EmptyState'
import { TableShell } from './TableShell'

export interface RunTestsTabProps {
  runId: string
}

export function RunTestsTab({ runId }: RunTestsTabProps) {
  const [verification, setVerification] = useState<VerificationStatus | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    const load = async () => {
      try {
        const loaded = await api.getRunVerification(runId)
        if (!active) return
        setVerification(loaded)
      } catch (err) {
        if (!active) return
        setError(err instanceof Error ? err.message : 'Test verification state is unavailable.')
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
    return <div className="status-feedback" role="status"><span className="status-spinner" /> Loading tests...</div>
  }

  if (error) {
    return <div className="status-feedback" role="alert"><p className="status-error-text">{error}</p></div>
  }

  if (!verification || !verification.checked) {
    return (
      <EmptyState
        title="Test status unavailable."
        message="This Run does not currently declare verification checks."
        detail="Unknown test values are shown as Unavailable rather than zero or passed."
      />
    )
  }

  return (
    <div className="run-tab-stack">
      <div className="run-fact-strip">
        <span><strong>Declared checks</strong> {verification.checks.length}</span>
        <span><strong>Evidence records</strong> {verification.evidence_count}</span>
      </div>
      <TableShell
        columns={['Check', 'Type', 'Required', 'Command status', 'Satisfied', 'Evidence']}
        caption="Verification checks"
        emptyTitle="No checks declared."
        emptyMessage="This workflow has no verification checks."
      >
        {verification.checks.map((check) => (
          <tr key={check.check_key}>
            <td><strong>{check.check_key}</strong></td>
            <td>{check.check_type}</td>
            <td>{check.required ? 'Required' : 'Optional'}</td>
            <td>{check.command_status ?? 'Unavailable'}</td>
            <td>{check.satisfied ? 'Yes' : 'No'}</td>
            <td>{check.evidence_id ? <code className="mono-badge">{check.evidence_id.slice(0, 8)}</code> : 'Unavailable'}</td>
          </tr>
        ))}
      </TableShell>
    </div>
  )
}
