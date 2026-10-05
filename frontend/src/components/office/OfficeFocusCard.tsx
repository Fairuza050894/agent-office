import type { AgentRun, Run, RunStage } from '../../api'
import { officeAgentState } from '../../officeProjection'
import { Link } from '../../router/Link'

export interface OfficeFocusCardProps {
  taskId: string | null
  taskTitle: string | null
  run: Run | null
  stages: RunStage[]
  agent: AgentRun | null
  agentProfileName: string | null
}

function completedStages(stages: RunStage[]): number {
  return stages.filter((stage) =>
    ['COMPLETED', 'APPROVED', 'DELIVERED'].includes(stage.status.toUpperCase()),
  ).length
}

export function OfficeFocusCard({
  taskId,
  taskTitle,
  run,
  stages,
  agent,
  agentProfileName,
}: OfficeFocusCardProps) {
  if (!run && !agent && !taskId) return null

  const stageTotal = stages.length
  const stageDone = completedStages(stages)
  const agentState = agent ? officeAgentState(agent.status) : null
  const hasTabs = stageTotal > 0 || agent !== null

  return (
    <aside className="office-focus-card" aria-label="Focused Task or Run">
      <div className="office-focus-head">
        <span className="office-hud-label">Focus</span>
        <strong>
          {taskTitle ?? (taskId ? `Task ${taskId.slice(0, 8)}` : 'Run focus')}
        </strong>
      </div>
      <dl className="office-focus-facts">
        {run && (
          <div>
            <dt>Run</dt>
            <dd>
              {run.id.slice(0, 8)} · {run.status}
            </dd>
          </div>
        )}
        {stageTotal > 0 ? (
          <div>
            <dt>Stages</dt>
            <dd>
              {stageDone} of {stageTotal} stages
            </dd>
          </div>
        ) : (
          run && (
            <div>
              <dt>Stages</dt>
              <dd>Stage data unavailable.</dd>
            </div>
          )
        )}
        {agent && (
          <div>
            <dt>AgentRun</dt>
            <dd>
              {agentProfileName ?? agent.agent_profile_key} · {agentState?.label ?? agent.status}
            </dd>
          </div>
        )}
      </dl>
      {hasTabs && (
        <div className="office-focus-links">
          {taskId && <Link href={`/tasks/${taskId}`}>Open Task</Link>}
          {run && <Link href={`/runs/${run.id}/office`}>Watch Run</Link>}
        </div>
      )}
    </aside>
  )
}
