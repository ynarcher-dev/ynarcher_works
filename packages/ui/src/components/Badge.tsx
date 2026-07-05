import type { ReactNode } from 'react'
import { cn } from '../utils/cn'

export type BadgeTone = 'neutral' | 'success' | 'warning' | 'info' | 'danger'

const toneClass: Record<BadgeTone, string> = {
  neutral: 'border-gray-300 bg-gray-50 text-gray-600',
  success: 'border-success-border bg-success-subtle text-success',
  warning: 'border-warning-border bg-warning-subtle text-warning',
  info: 'border-info-border bg-info-subtle text-info',
  danger: 'border-danger-border bg-danger-subtle text-danger',
}

export interface BadgeProps {
  tone?: BadgeTone
  dot?: boolean
  children: ReactNode
  className?: string
}

/**
 * 상태 뱃지(세만틱 3단 대비 및 둥근 토스 스타일).
 */
export function Badge({ tone = 'neutral', dot = false, children, className }: BadgeProps) {
  const dotColorClass: Record<BadgeTone, string> = {
    neutral: 'bg-gray-400',
    success: 'bg-success',
    warning: 'bg-warning',
    info: 'bg-info',
    danger: 'bg-danger',
  }

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-radius-sm border px-2 py-0.5 text-caption font-semibold transition-all duration-fast shadow-sm shadow-gray-900/5',
        toneClass[tone],
        className,
      )}
    >
      {dot && (
        <span
          className={cn('h-1.5 w-1.5 shrink-0 rounded-full', dotColorClass[tone])}
          aria-hidden="true"
        />
      )}
      {children}
    </span>
  )
}
