import type {
  AuditRecord,
  Evidence,
  Finding,
  Project,
  ResultReview,
  Run,
  Task,
} from '../api'

export interface ChangeDossierInput {
  project: Project
  task: Task
  run: Run
  review: ResultReview & {
    changes_requested_at?: string | null
    approved_at?: string | null
    delivered_at?: string | null
  }
  evidence: Evidence[]
  findings: Finding[]
  audit: AuditRecord[]
}

function inline(value: string | null | undefined): string {
  if (!value) return '—'
  return value.replace(/[\r\n]+/g, ' ').replace(/\|/g, '\\|').trim() || '—'
}

function block(value: string | null | undefined): string {
  if (!value) return '—'
  return value.replace(/```/g, "'''").trim() || '—'
}

function timestamp(value: string | null | undefined): string {
  if (!value) return '—'
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? inline(value) : parsed.toISOString()
}

function sortedAudit(records: AuditRecord[]): AuditRecord[] {
  return records.slice().sort((left, right) => left.occurred_at.localeCompare(right.occurred_at))
}

export function buildAcceptedChangeDossier(input: ChangeDossierInput): string {
  const { project, task, run, review } = input
  if (review.state !== 'DELIVERED') {
    throw new Error('A change dossier can only be exported after human acceptance and managed delivery.')
  }

  const evidence = input.evidence.slice().sort((a, b) => a.created_at.localeCompare(b.created_at))
  const findings = input.findings.slice().sort((a, b) => a.created_at.localeCompare(b.created_at))
  const decisions = sortedAudit(input.audit).filter((record) =>
    ['RESULT_CHANGES_REQUESTED', 'RESULT_REMEDIATION_CREATED', 'RESULT_APPROVED', 'RESULT_DELIVERED'].includes(
      record.action,
    ),
  )

  const lines: string[] = [
    '# Agent Office Change Dossier',
    '',
    '> Canonical export. Technical `COMPLETED` and human `DELIVERED` are separate facts.',
    '',
    '## Delivery identity',
    '',
    '| Fact | Value |',
    '| --- | --- |',
    `| Project | ${inline(project.name)} |`,
    `| Repository | ${inline(project.repository.name)} |`,
    `| Task | ${inline(task.title)} |`,
    `| Task ID | \`${inline(task.id)}\` |`,
    `| Run ID | \`${inline(run.id)}\` |`,
    `| Technical status | ${inline(run.status)} |`,
    `| Human result state | ${inline(review.state)} |`,
    `| Managed branch | \`${inline(review.delivered_branch)}\` |`,
    `| Managed commit | \`${inline(review.delivered_commit)}\` |`,
    `| Run completed at | ${timestamp(run.completed_at)} |`,
    `| Result approved at | ${timestamp(review.approved_at)} |`,
    `| Delivered at | ${timestamp(review.delivered_at)} |`,
    '',
    '## Task intent',
    '',
    '### Objective',
    '',
    block(task.objective),
    '',
    '### Constraints and human review amendments',
    '',
    '```text',
    block(task.constraints),
    '```',
    '',
    '## Verification evidence',
    '',
  ]

  if (evidence.length === 0) {
    lines.push('No Evidence records were available for this Run.', '')
  } else {
    lines.push('| Status | Kind | Summary | Recorded at |', '| --- | --- | --- | --- |')
    for (const item of evidence) {
      lines.push(
        `| ${inline(item.status)} | ${inline(item.kind)} | ${inline(item.summary)} | ${timestamp(item.created_at)} |`,
      )
    }
    lines.push('')
  }

  lines.push('## Review findings', '')
  if (findings.length === 0) {
    lines.push('No Finding records were recorded for this Run.', '')
  } else {
    lines.push('| Severity | Status | Finding | Resolution |', '| --- | --- | --- | --- |')
    for (const finding of findings) {
      lines.push(
        `| ${inline(finding.severity)} | ${inline(finding.status)} | ${inline(finding.title)} | ${inline(finding.resolution_summary)} |`,
      )
    }
    lines.push('')
  }

  lines.push('## Human decision and delivery audit', '')
  if (decisions.length === 0) {
    lines.push('No result-decision AuditRecords were available.', '')
  } else {
    lines.push('| Time | Actor | Action | Target |', '| --- | --- | --- | --- |')
    for (const record of decisions) {
      lines.push(
        `| ${timestamp(record.occurred_at)} | ${inline(record.actor_type)} | ${inline(record.action)} | ${inline(record.target_id)} |`,
      )
    }
    lines.push('')
  }

  lines.push(
    '## Trust statement',
    '',
    '- This dossier is projected from canonical Task, Run, Evidence, Finding, ResultReview, and AuditRecord data.',
    '- It does not infer missing verification, approvals, cost, productivity, or delivery state.',
    '- Managed delivery records a local accepted branch/commit. It does not imply push or merge to the Project default branch.',
    '',
  )

  return lines.join('\n')
}

export function acceptedChangeDossierFilename(task: Task, run: Run): string {
  const slug = task.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
  return `agent-office-${slug || 'task'}-${run.id.slice(0, 8)}-change-dossier.md`
}
