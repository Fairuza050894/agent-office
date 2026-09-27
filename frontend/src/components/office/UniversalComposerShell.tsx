import { useEffect, useState } from 'react'

import type {
  ComposerIntent,
  ComposerMessage,
  ComposerThread,
  Executor,
  IntentResolution,
  Project,
} from '../../api'

export interface ComposerSubmitPayload {
  intent: ComposerIntent
  instruction: string
  executorId: string | null
}

export interface UniversalComposerShellProps {
  projects: Project[]
  selectedProjectId: string
  onProjectChange?: (projectId: string) => void
  projectLocked?: boolean
  threads?: ComposerThread[]
  selectedThreadId?: string
  onThreadChange?: (threadId: string) => void
  isThreadLoading?: boolean
  executors: Executor[]
  selectedExecutorId?: string | null
  contextLabel?: string
  onSubmit?: (payload: ComposerSubmitPayload) => Promise<void> | void
  isSubmitting?: boolean
  activeThread?: ComposerThread | null
  resolution?: IntentResolution | null
  messages?: ComposerMessage[]
  error?: string | null
}

export function UniversalComposerShell({
  projects,
  selectedProjectId,
  onProjectChange,
  projectLocked = false,
  threads = [],
  selectedThreadId = '',
  onThreadChange,
  isThreadLoading = false,
  executors,
  selectedExecutorId,
  contextLabel,
  onSubmit,
  isSubmitting = false,
  activeThread = null,
  resolution = null,
  messages = [],
  error = null,
}: UniversalComposerShellProps) {
  const [intent, setIntent] = useState<ComposerIntent>('AUTO')
  const [instruction, setInstruction] = useState('')
  const [executorId, setExecutorId] = useState(selectedExecutorId ?? '')

  useEffect(() => {
    if (activeThread) {
      setIntent(activeThread.requested_intent)
      setExecutorId(activeThread.executor_id ?? selectedExecutorId ?? '')
      return
    }

    setIntent('AUTO')
    setExecutorId(selectedExecutorId ?? '')
  }, [activeThread, selectedExecutorId])

  const canSend =
    Boolean(onSubmit) &&
    !isSubmitting &&
    !isThreadLoading &&
    Boolean(selectedProjectId) &&
    Boolean(instruction.trim())

  const submit = async () => {
    if (!onSubmit || !canSend) return
    await onSubmit({
      intent,
      instruction: instruction.trim(),
      executorId: executorId || null,
    })
    setInstruction('')
  }

  return (
    <section className="office-composer" aria-label="Universal Composer">
      {(activeThread || resolution || messages.length > 0) && (
        <div className="office-composer-thread" aria-label="Composer planning thread">
          <div className="office-composer-thread-meta">
            <span className="office-mode-indicator">
              {resolution?.resolved_intent ?? activeThread?.resolved_intent ?? 'PLANNING'}
            </span>
            {activeThread && (
              <span>
                Thread {activeThread.id.slice(0, 8)} · {activeThread.status}
              </span>
            )}
            {resolution && <span>{resolution.reason_summary}</span>}
          </div>
          {messages.length > 0 && (
            <div className="office-composer-history">
              {messages.map((message) => (
                <div key={message.id} className="office-composer-message">
                  <span>{message.actor_type === 'USER' ? 'You' : message.role_key ?? 'System'}</span>
                  <p>{message.content}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="office-composer-context">
        <select
          className="office-composer-select"
          aria-label="Composer project"
          value={selectedProjectId}
          disabled={
            projectLocked || projects.length === 0 || isSubmitting || isThreadLoading
          }
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
          aria-label="Composer planning history"
          value={selectedThreadId}
          disabled={
            !selectedProjectId ||
            threads.length === 0 ||
            isSubmitting ||
            isThreadLoading
          }
          onChange={(event) => onThreadChange?.(event.target.value)}
        >
          <option value="">New planning thread</option>
          {threads.map((thread) => (
            <option key={thread.id} value={thread.id}>
              {thread.title ?? `Thread ${thread.id.slice(0, 8)}`} · {thread.status}
            </option>
          ))}
        </select>

        <select
          className="office-composer-select"
          aria-label="Composer intent"
          value={intent}
          disabled={isSubmitting || isThreadLoading}
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
          disabled={executors.length === 0 || isSubmitting || isThreadLoading}
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
          title="Bounded file/evidence context attachment arrives with the Phase 9D context resolver."
        >
          + Context
        </button>

        {contextLabel && <span className="office-composer-note">{contextLabel}</span>}
      </div>

      <div className="office-composer-body">
        <label className="sr-only" htmlFor="office-universal-composer">
          Ask Agent Office
        </label>
        <textarea
          id="office-universal-composer"
          className="office-composer-input"
          value={instruction}
          disabled={isSubmitting || isThreadLoading}
          onChange={(event) => setInstruction(event.target.value)}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
              event.preventDefault()
              void submit()
            }
          }}
          placeholder="Ask, plan, brainstorm, or describe what you want to continue in this project..."
        />
        <div className="office-composer-actions">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={!canSend}
            onClick={() => void submit()}
          >
            {isThreadLoading ? 'Restoring…' : isSubmitting ? 'Preparing…' : 'Send'}
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled
            title="Starting repository-changing execution remains blocked until Phase 9E promotion."
          >
            Start Run
          </button>
        </div>
      </div>

      {error ? (
        <span className="office-composer-error" role="alert">
          {error}
        </span>
      ) : (
        <span className="office-composer-note">
          Stored planning threads can be reopened for decisions and history. New prompts start a fresh deterministic planning turn unless an unprepared OPEN thread is being recovered.
        </span>
      )}
    </section>
  )
}
