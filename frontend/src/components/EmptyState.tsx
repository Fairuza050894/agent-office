import { type ReactNode } from 'react'

export interface EmptyStateProps {
  title: string
  message: string
  detail?: string
  children?: ReactNode
}

export function EmptyState({ title, message, detail, children }: EmptyStateProps) {
  return (
    <div className="empty-state" role="status">
      <h3 className="empty-state-title">{title}</h3>
      <p className="empty-state-message">{message}</p>
      {detail && <p className="empty-state-detail">{detail}</p>}
      {children && <div className="empty-state-actions">{children}</div>}
    </div>
  )
}
