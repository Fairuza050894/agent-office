import { Link } from '../../router/Link'

export type AgentOfficeScope = 'workspace' | 'live' | 'replay'

export interface AgentOfficeScopeSwitcherProps {
  projectId: string | null
  runId?: string | null
  activeScope: AgentOfficeScope
  onLive?: () => void
  onReplay?: () => void
}

export function AgentOfficeScopeSwitcher({
  projectId,
  runId = null,
  activeScope,
  onLive,
  onReplay,
}: AgentOfficeScopeSwitcherProps) {
  const workspaceHref = projectId ? `/office?project=${projectId}` : '/office'
  const liveHref = runId ? `/runs/${runId}/office` : null
  const replayHref = runId ? `/runs/${runId}/office?mode=replay` : null

  return (
    <div className="office-scope-switcher" aria-label="Agent Office scope">
      <Link
        href={workspaceHref}
        className={`office-scope-link ${activeScope === 'workspace' ? 'active' : ''}`}
        aria-current={activeScope === 'workspace' ? 'page' : undefined}
      >
        Workspace
      </Link>

      {activeScope === 'workspace' ? (
        liveHref ? (
          <Link href={liveHref} className="office-scope-link">
            Run
          </Link>
        ) : (
          <span className="office-scope-link disabled" aria-disabled="true">
            Run
          </span>
        )
      ) : (
        <button
          type="button"
          className={`office-scope-link ${activeScope === 'live' ? 'active' : ''}`}
          aria-pressed={activeScope === 'live'}
          onClick={onLive}
        >
          Run
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
