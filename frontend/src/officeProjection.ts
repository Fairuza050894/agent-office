import type { AgentEvent } from './api'

export interface OfficeState {
  key: string
  label: string
}

export function officeAgentState(status: string): OfficeState {
  switch (status.toUpperCase()) {
    case 'PENDING':
    case 'CREATED':
      return { key: 'pending', label: 'Waiting to start' }
    case 'STARTING':
      return { key: 'starting', label: 'Starting' }
    case 'ARRIVING':
      return { key: 'starting', label: 'Arriving' }
    case 'RUNNING':
      return { key: 'running', label: 'Running' }
    case 'WORKING':
      return { key: 'running', label: 'Working' }
    case 'PLANNING':
      return { key: 'running', label: 'Planning' }
    case 'AVAILABLE':
      return { key: 'completed', label: 'Available' }
    case 'COFFEE_BREAK':
      return { key: 'waiting', label: 'Coffee break' }
    case 'LUNCH_BREAK':
      return { key: 'waiting', label: 'Lunch break' }
    case 'SOCIAL_BREAK':
      return { key: 'waiting', label: 'Social break' }
    case 'PRAYER_BREAK':
      return { key: 'waiting', label: 'Prayer break' }
    case 'WAITING_USER':
      return { key: 'waiting', label: 'Waiting for you' }
    case 'WAITING':
      return { key: 'waiting', label: 'Waiting' }
    case 'BLOCKED':
      return { key: 'blocked', label: 'Blocked' }
    case 'FAILED':
      return { key: 'failed', label: 'Failed' }
    case 'COMPLETED':
      return { key: 'completed', label: 'Completed' }
    case 'CANCELLED':
      return { key: 'cancelled', label: 'Cancelled' }
    case 'OFFLINE':
      return { key: 'cancelled', label: 'Offline' }
    default:
      return { key: 'unknown', label: status || 'Unknown' }
  }
}

export function officeLatestAgentEvent(
  agentId: string,
  events: AgentEvent[],
): AgentEvent | null {
  return (
    events
      .filter((event) => event.agent_run_id === agentId)
      .slice()
      .sort((left, right) => right.occurred_at.localeCompare(left.occurred_at))[0] ?? null
  )
}
