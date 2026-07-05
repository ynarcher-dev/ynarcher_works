import type { ReactNode } from 'react'
import { cn } from '../utils/cn'

export interface EmptyStateProps {
  title: string
  description?: string
  action?: ReactNode
  className?: string
}

/** 빈 상태(Empty State). */
export function EmptyState({
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-2 py-12 text-center',
        className,
      )}
    >
      <p className="text-body-lg font-medium text-gray-700">{title}</p>
      {description && <p className="text-body text-gray-500">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}
