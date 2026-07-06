import type { ReactNode } from 'react'
import { cn } from '../utils/cn'

export type BadgeTone = 'neutral' | 'success' | 'warning' | 'info' | 'danger'
export type BadgeSize = 'sm' | 'md'

const toneClass: Record<BadgeTone, string> = {
  neutral: 'border-gray-300 bg-gray-50 text-gray-600',
  success: 'border-success-border bg-success-subtle text-success',
  warning: 'border-warning-border bg-warning-subtle text-warning',
  info: 'border-info-border bg-info-subtle text-info',
  danger: 'border-danger-border bg-danger-subtle text-danger',
}

/** md: 기본 상태 배지. sm: 표 태그 등 밀도 높은 곳용 컴팩트(패딩·굵기·그림자 축소). */
const sizeClass: Record<BadgeSize, string> = {
  md: 'px-2 py-0.5 text-caption font-semibold shadow-sm shadow-gray-900/5',
  sm: 'px-2 py-0.5 text-[0.6875rem] font-medium',
}

export interface BadgeProps {
  tone?: BadgeTone
  size?: BadgeSize
  dot?: boolean
  children: ReactNode
  className?: string
}

/**
 * 상태 뱃지(세만틱 3단 대비 및 둥근 토스 스타일).
 */
export function Badge({ tone = 'neutral', size = 'md', dot = false, children, className }: BadgeProps) {
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
        'inline-flex items-center gap-1 rounded-radius-sm border transition-all duration-fast',
        sizeClass[size],
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
