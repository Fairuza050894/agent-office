import { useEffect, useState } from 'react'

import type { Executor, Project } from '../../api'

export type ComposerIntent = 'AUTO' | 'ASK' | 'PLAN' | 'BRAINSTORM' | 'RUN'

export interface UniversalComposerShellProps {
  projects: Project[]
  selectedProjectId: string
  onProjectChange?: (projectId: string) => void
  projectLocked?: boolean
  executors: Executor[]
  selectedExecutorId?: string | null
  contextLabel?: string
}

export function UniversalComposerShell({
  projects,
  selectedProjectId,
  onProjectChange,
  projectLocked = false,
  executors,
  selectedExecutorId,
  contextLabel,
}: UniversalComposerShellProps) {
  const [intent, setIntent] = useState<ComposerIntent>('AUTO')
  const [instruction, setInstruction] = useState('')
  const [executorId, setExecutorId] = useState(selectedExecutorId ?? '')

  useEffect(() => {
    setExecutorId(selectedExecutorId ?? '')
  }, [selectedExecutorId])

  return (
    <section className="office-composer" aria-label="Universal Composer">
      <div className="office-composer-context">
        <select
          className="office-composer-select"
          aria-label="Composer project"
          value={selectedProjectId}
          disabled={projectLocked || projects.length === 0}
          onChange={(event) => onProjectChange?.(event.target.value)}
        >
          {projects.length === 0 ? (
            <option value="">No registered Project</option>
          ) : (
            projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))
          )}
        </select>

        <select
          className="office-composer-select"
          aria-label="Composer intent"
          value={intent}
          onChange={(event) => setIntent(event.target.value as ComposerIntent)}
        >
          <option value="AUTO">AUTO</option>
          <option value="ASK">ASK</option>
          <option value="PLAN">PLAN</option>
          <option value="BRAINSTORM">BRAINSTORM</option>
          <option value="RUN">RUN</option>
        </select>

        <select
          className="office-composer-select"
          aria-label="Composer executor"
          value={executorId}
          disabled={executors.length === 0}
          onChange={(event) => setExecutorId(event.target.value)}
        >
          {executors.length === 0 && <option value="">No executor</option>}
          {executors.map((executor) => (
            <option key={executor.id} value={executor.id}>
              {executor.name}
            </option>
          ))}
        </select>

        <button
          type="button"
          className="btn btn-secondary btn-sm"
          disabled
          title="Context attachment is implemented in a later Phase 9 slice."
        >
          + Context
        </button>

        {contextLabel && (
          <span className="office-composer-note">{contextLabel}</span>
        )}
      </div>

      <div className="office-composer-body">
        <label className="sr-only" htmlFor="office-universal-composer">
          Ask Agent Office
        </label>
        <textarea
          id="office-universal-composer"
          className="office-composer-input"
          value={instruction}
          onChange={(event) => setInstruction(event.target.value)}
          placeholder="Ask Agent Office about this project, plan work, brainstorm, or prepare a Run..."
        />
        <div className="office-composer-actions">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled
            title="Composer persistence and planning APIs arrive in Phase 9B/9C."
          >
            Send
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled
            title="A Run cannot start until Phase 9 adds approved executable scope."
          >
            Start Run
          </button>
        </div>
      </div>

      <span className="office-composer-note">
        Phase 9A interaction shell · no planning record or repository mutation is created here.
      </span>
    </section>
  )
}
