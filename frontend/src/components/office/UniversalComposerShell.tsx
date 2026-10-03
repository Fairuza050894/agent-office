import { useState } from 'react'

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

interface ContextDraft<T> {
  contextKey: string
  value: T
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
  const baseIntent = activeThread?.requested_intent ?? 'AUTO'
  const baseExecutorId = activeThread?.executor_id ?? selectedExecutorId ?? ''
  const contextKey = [
    selectedProjectId || 'no-project',
    activeThread?.id ?? 'new-thread',
    baseIntent,
    baseExecutorId || 'auto-executor',
  ].join(':')

  const [intentDraft, setIntentDraft] = useState<ContextDraft<ComposerIntent>>({
    contextKey,
    value: baseIntent,
  })
  const [executorDraft, setExecutorDraft] = useState<ContextDraft<string>>({
    contextKey,
    value: baseExecutorId,
  })
  const [instructionDraft, setInstructionDraft] = useState<ContextDraft<string>>({
    contextKey,
    value: '',
  })

  const intent =
    intentDraft.contextKey === contextKey ? intentDraft.value : baseIntent
  const executorId =
    executorDraft.contextKey === contextKey
      ? executorDraft.value
      : baseExecutorId
  const instruction =
    instructionDraft.contextKey === contextKey ? instructionDraft.value : ''

  const selectedProjectName =
    projects.find((project) => project.id === selectedProjectId)?.name ??
    'No Project'
  const selectedExecutorName =
    executors.find((executor) => executor.id === executorId)?.name ??
    (executorId ? 'Configured executor' : 'Auto-resolve')

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
    setInstructionDraft({ contextKey, value: '' })
  }

  const submitLabel = isThreadLoading
    ? 'Restoring…'
    : isSubmitting
      ? 'Preparing…'
      : intent === 'RUN'
        ? 'Review run'
        : 'Send'

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

      <details className="office-composer-context" open={!selectedProjectId}>
        <summary>
          <span>Context</span>
          <strong>{selectedProjectName}</strong>
          <span>{activeThread ? `Thread ${activeThread.id.slice(0, 8)}` : 'New thread'}</span>
          <span>{intent === 'AUTO' ? 'Auto orchestration' : intent}</span>
          <span>{selectedExecutorName}</span>
        </summary>
        <div className="office-composer-context-controls">
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
            onChange={(event) =>
              setIntentDraft({
                contextKey,
                value: event.target.value as ComposerIntent,
              })
            }
          >
            <option value="AUTO">AUTO · let Agent Office route the work</option>
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
            onChange={(event) =>
              setExecutorDraft({ contextKey, value: event.target.value })
            }
          >
            <option value="">Auto-resolve executor</option>
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
            title="Bounded context attachment is unavailable until a safe content contract exists."
          >
            + Context
          </button>

          {contextLabel && <span className="office-composer-note">{contextLabel}</span>}
        </div>
      </details>

      <div className="office-composer-body">
        <label className="sr-only" htmlFor="office-universal-composer">
          Ask Agent Office
        </label>
        <textarea
          id="office-universal-composer"
          className="office-composer-input"
          value={instruction}
          disabled={isSubmitting || isThreadLoading}
          onChange={(event) =>
            setInstructionDraft({ contextKey, value: event.target.value })
          }
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
              event.preventDefault()
              void submit()
            }
          }}
          placeholder="Describe the outcome you want. Agent Office will plan the team, workflow and execution context."
        />
        <div className="office-composer-actions">
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={!canSend}
            title={
              intent === 'RUN'
                ? 'Review RUN intent and planning scope. This does not bypass execution gates.'
                : undefined
            }
            onClick={() => void submit()}
          >
            {submitLabel}
          </button>
        </div>
      </div>

      {error ? (
        <span className="office-composer-error" role="alert">
          {error}
        </span>
      ) : (
        <span className="office-composer-note">
          AUTO is zero-config: project context, team, workflow and executor are resolved through existing safety gates. RUN never bypasses canonical Task/Run promotion.
        </span>
      )}
    </section>
  )
}
