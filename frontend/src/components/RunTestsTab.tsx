import { useEffect, useState } from 'react'
import { api, type Evidence, type VerificationStatus } from '../api'
import { EmptyState } from './EmptyState'
import { TableShell } from './TableShell'

export interface RunTestsTabProps {
  runId: string
}

function metadataInt(metadata: Record<string, string> | undefined, key: string): number | null {
  if (!metadata) return null
  const raw = metadata[key]
  if (raw === undefined) return null
  const parsed = Number.parseInt(raw, 10)
  return Number.isNaN(parsed) ? null : parsed
}

function formatDuration(durationMs: number | null): string {
  if (durationMs === null) return 'Unavailable'
  if (durationMs < 1000) return `${durationMs} ms`
  const seconds = durationMs / 1000
  if (seconds < 60) return `${seconds.toFixed(1)} s`
  return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`
}

export function RunTestsTab({ runId }: RunTestsTabProps) {
  const [verification, setVerification] = useState<VerificationStatus | null>(null)
  const [evidenceById, setEvidenceById] = useState<Map<string, Evidence>>(new Map())
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    const load = async () => {
      try {
        const [loaded, loadedEvidence] = await Promise.all([
          api.getRunVerification(runId),
          api.getRunEvidence(runId).catch(() => [] as Evidence[]),
        ])
        if (!active) return
        setVerification(loaded)
        setEvidenceById(new Map(loadedEvidence.map((item) => [item.id, item])))
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
        columns={['Check', 'Type', 'Required', 'Command', 'Exit code', 'Duration', 'Satisfied', 'Evidence']}
        caption="Verification checks"
        emptyTitle="No checks declared."
        emptyMessage="This workflow has no verification checks."
      >
        {verification.checks.map((check) => {
          const record = check.evidence_id ? evidenceById.get(check.evidence_id) : undefined
          return (
            <tr key={check.check_key}>
              <td><strong>{check.check_key}</strong></td>
              <td>{check.check_type}</td>
              <td>{check.required ? 'Required' : 'Optional'}</td>
              <td><code className="mono-badge">{record?.metadata?.['command_status'] ?? check.command_status ?? 'Unavailable'}</code></td>
              <td>{metadataInt(record?.metadata, 'exit_code') ?? 'Unavailable'}</td>
              <td>{formatDuration(metadataInt(record?.metadata, 'duration_ms'))}</td>
              <td>{check.satisfied ? 'Yes' : 'No'}</td>
              <td>{check.evidence_id ? <code className="mono-badge">{check.evidence_id.slice(0, 8)}</code> : 'Unavailable'}</td>
            </tr>
          )
        })}
      </TableShell>
    </div>
  )
}
