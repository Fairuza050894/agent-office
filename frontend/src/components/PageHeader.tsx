import { type ReactNode } from 'react'

export interface PageHeaderProps {
  eyebrow?: string
  title: string
  description: string
  action?: ReactNode
}

export function PageHeader({ eyebrow, title, description, action }: PageHeaderProps) {
  return (
    <div className="page-header">
      <div className="page-header-text">
        {eyebrow && <span className="page-eyebrow">{eyebrow}</span>}
        <h1 className="page-title">{title}</h1>
        <p className="page-description">{description}</p>
      </div>
      {action && <div className="page-header-action">{action}</div>}
    </div>
  )
}
