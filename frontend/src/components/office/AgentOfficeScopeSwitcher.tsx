import type { OfficeFloorKey } from '../../office3d/livingOffice'
import { Link } from '../../router/Link'

export type AgentOfficeScope = 'workspace' | 'live' | 'replay'

export interface AgentOfficeScopeSwitcherProps {
  projectId: string | null
  runId?: string | null
  activeScope: AgentOfficeScope
  floor?: OfficeFloorKey | null
  onLive?: () => void
  onReplay?: () => void
}

export function AgentOfficeScopeSwitcher({
  projectId,
  runId = null,
  activeScope,
  floor = null,
  onLive,
  onReplay,
}: AgentOfficeScopeSwitcherProps) {
  const workspaceParams = new URLSearchParams()
  if (projectId) workspaceParams.set('project', projectId)
  if (floor) workspaceParams.set('floor', floor)
  const workspaceQuery = workspaceParams.toString()
  const workspaceHref = workspaceQuery ? `/office?${workspaceQuery}` : '/office'

  const runParams = new URLSearchParams()
  if (floor) runParams.set('floor', floor)
  const runQuery = runParams.toString()
  const liveHref = runId
    ? `/runs/${runId}/office${runQuery ? `?${runQuery}` : ''}`
    : null

  const replayParams = new URLSearchParams(runParams)
  replayParams.set('mode', 'replay')
  const replayHref = runId
    ? `/runs/${runId}/office?${replayParams.toString()}`
    : null

  return (
    <div className="office-scope-switcher" aria-label="Agent Office scope">
      <Link
        href={workspaceHref}
        className={`office-scope-link ${activeScope === 'workspace' ? 'active' : ''}`}
        aria-current={activeScope === 'workspace' ? 'page' : undefined}
      >
        Planning
      </Link>

      {activeScope === 'workspace' ? (
        liveHref ? (
          <Link href={liveHref} className="office-scope-link">
            Live
          </Link>
        ) : (
          <span className="office-scope-link disabled" aria-disabled="true">
            Live
          </span>
        )
      ) : (
        <button
          type="button"
          className={`office-scope-link ${activeScope === 'live' ? 'active' : ''}`}
          aria-pressed={activeScope === 'live'}
          onClick={onLive}
        >
          Live
        </button>
      )}

      {activeScope === 'workspace' ? (
        replayHref ? (
          <Link href={replayHref} className="office-scope-link">
            Replay
          </Link>
        ) : (
          <span className="office-scope-link disabled" aria-disabled="true">
            Replay
          </span>
        )
      ) : (
        <button
          type="button"
          className={`office-scope-link ${activeScope === 'replay' ? 'active' : ''}`}
          aria-pressed={activeScope === 'replay'}
          onClick={onReplay}
        >
          Replay
        </button>
      )}
    </div>
  )
}
