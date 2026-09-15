import { type ReactNode } from 'react'
import { EmptyState } from './EmptyState'

export interface TableShellProps {
  columns: string[]
  caption?: string
  emptyTitle: string
  emptyMessage: string
  emptyDetail?: string
  children?: ReactNode
}

export function TableShell({
  columns,
  caption,
  emptyTitle,
  emptyMessage,
  emptyDetail,
  children,
}: TableShellProps) {
  return (
    <div className="table-container">
      <table className="operational-table">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col} scope="col">
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {children ? (
            children
          ) : (
            <tr>
              <td colSpan={columns.length} className="table-empty-cell">
                <EmptyState
                  title={emptyTitle}
                  message={emptyMessage}
                  detail={emptyDetail}
                />
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
