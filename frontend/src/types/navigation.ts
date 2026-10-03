export type NavSection = 'WORK' | 'ENGINEERING' | 'OBSERVABILITY' | 'CONTROL'

export interface NavItem {
  id: string
  label: string
  path: string
  section: NavSection
  description: string
}

export const NAV_SECTIONS: NavSection[] = [
  'WORK',
  'ENGINEERING',
  'OBSERVABILITY',
  'CONTROL',
]

export const NAV_ITEMS: NavItem[] = [
  // WORK
  {
    id: 'office',
    label: 'Office',
    path: '/office',
    section: 'WORK',
    description: 'Office-first planning and operational control surface for project-scoped work.',
  },
  {
    id: 'overview',
    label: 'Overview',
    path: '/overview',
    section: 'WORK',
    description: 'Real-time status of active runs, attention items, and control plane resources.',
  },
  {
    id: 'projects',
    label: 'Projects',
    path: '/projects',
    section: 'WORK',
    description: 'Registered Git repositories managed by Agent Office.',
  },
  {
    id: 'runs',
    label: 'Runs',
    path: '/runs',
    section: 'WORK',
    description: 'Workflow execution runs across registered projects.',
  },
  {
    id: 'tasks',
    label: 'Tasks',
    path: '/tasks',
    section: 'WORK',
    description: 'Engineering objectives and task assignments.',
  },

  // ENGINEERING
  {
    id: 'agents',
    label: 'Agents',
    path: '/agents',
    section: 'ENGINEERING',
    description: 'Reusable agent profiles and role definitions.',
  },
  {
    id: 'workflows',
    label: 'Workflows',
    path: '/workflows',
    section: 'ENGINEERING',
    description: 'Workflow definitions and stage graph contracts.',
  },
  {
    id: 'executors',
    label: 'Executors',
    path: '/executors',
    section: 'ENGINEERING',
    description: 'Execution backends and runtime adapters for agent runs.',
  },

  // OBSERVABILITY
  {
    id: 'kpi',
    label: 'Project KPI',
    path: '/kpi',
    section: 'OBSERVABILITY',
    description: 'Task and Run delivery metrics derived from canonical execution facts.',
  },
  {
    id: 'activity',
    label: 'Activity',
    path: '/activity',
    section: 'OBSERVABILITY',
    description: 'Chronological feed of normalized lifecycle and execution events.',
  },
  {
    id: 'evidence',
    label: 'Evidence',
    path: '/evidence',
    section: 'OBSERVABILITY',
    description: 'Source-attributed verification artifacts, test results, and review findings.',
  },

  // CONTROL
  {
    id: 'audit',
    label: 'Audit',
    path: '/audit',
    section: 'CONTROL',
    description: 'Attributable record of security decisions, command approvals, and state changes.',
  },
  {
    id: 'settings',
    label: 'Settings',
    path: '/settings',
    section: 'CONTROL',
    description: 'Local control plane configuration, storage roots, and safety policy.',
  },
]
