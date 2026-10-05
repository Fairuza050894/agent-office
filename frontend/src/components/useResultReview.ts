import { useCallback, useEffect, useState } from 'react'

import { api, type ResultReview, type Run } from '../api'

export interface ResultReviewController {
  review: ResultReview | null
  feedback: string
  note: string
  isWorking: boolean
  isLoading: boolean
  error: string | null
  setFeedback: (value: string) => void
  setNote: (value: string) => void
  requestChanges: () => Promise<void>
  approveAndDeliver: () => Promise<void>
  reload: () => Promise<void>
}

export function approveDisabledReason(
  run: Run | null,
  review: ResultReview | null,
): string | null {
  if (!run) return 'No execution Run yet. Approval needs a completed Run with a verified candidate.'
  if (run.status !== 'COMPLETED') {
    return `Run is ${run.status}. Approval needs technical COMPLETED first.`
  }
  if (!review) return 'Review state is unavailable. Retry loading before deciding.'
  if (review.state === 'DELIVERED') return 'Already accepted and delivered. No further approval.'
  if (review.state === 'CHANGES_REQUESTED') {
    return 'Changes were already requested. Review the remediation Run instead.'
  }
  if (review.state === 'NOT_READY') {
    return 'No verified candidate is reviewable yet.'
  }
  if (!review.can_approve) return 'Approval is not permitted in this review state.'
  return null
}

export function requestChangesDisabledReason(
  run: Run | null,
  review: ResultReview | null,
): string | null {
  if (!run) return 'No execution Run yet. Change requests need a completed Run.'
  if (run.status !== 'COMPLETED') {
    return `Run is ${run.status}. Change requests need technical COMPLETED first.`
  }
  if (!review) return 'Review state is unavailable. Retry loading before deciding.'
  if (review.state === 'DELIVERED') return 'Already accepted and delivered. It cannot be changed by a later review.'
  if (review.state === 'APPROVED') return 'Already approved. Only managed delivery can be retried.'
  if (review.state === 'CHANGES_REQUESTED') {
    return 'Changes were already requested. Review the remediation Run instead.'
  }
  if (review.state === 'NOT_READY') {
    return 'No verified candidate is reviewable yet.'
  }
  if (!review.can_request_changes) return 'Change requests are not permitted in this review state.'
  return null
}

export function useResultReview(runId: string | null): ResultReviewController {
  const [review, setReview] = useState<ResultReview | null>(null)
  const [feedback, setFeedback] = useState('')
  const [note, setNote] = useState('')
  const [isWorking, setIsWorking] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setReview(null)
    setFeedback('')
    setNote('')
    setError(null)
    if (!runId) {
      return
    }
    setIsLoading(true)
    try {
      const result = await api.getResultReview(runId)
      setReview(result)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Result review is unavailable.')
    } finally {
      setIsLoading(false)
    }
  }, [runId])

  useEffect(() => {
    void Promise.resolve().then(load)
  }, [load])

  const requestChanges = useCallback(async () => {
    if (!runId) return
    const normalized = feedback.trim()
    if (!normalized || isWorking) return
    setIsWorking(true)
    setError(null)
    try {
      const result = await api.requestResultChanges(runId, { feedback: normalized })
      setReview(result)
      setFeedback('')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Changes could not be requested.')
    } finally {
      setIsWorking(false)
    }
  }, [feedback, isWorking, runId])

  const approveAndDeliver = useCallback(async () => {
    if (!runId || isWorking) return
    setIsWorking(true)
    setError(null)
    try {
      const result = await api.approveAndDeliverResult(runId, {
        note: note.trim() || null,
      })
      setReview(result)
      setNote('')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Result could not be delivered.')
    } finally {
      setIsWorking(false)
    }
  }, [isWorking, note, runId])

  return {
    review,
    feedback,
    note,
    isWorking,
    isLoading,
    error,
    setFeedback,
    setNote,
    requestChanges,
    approveAndDeliver,
    reload: load,
  }
}
