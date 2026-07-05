import type { ReactNode } from 'react'
import { cn } from '../utils/cn'

export type BadgeTone = 'neutral' | 'success' | 'warning' | 'info' | 'danger'

const toneClass: Record<BadgeTone, string> = {
  neutral: 'border-gray-200 bg-gray-50 text-gray-600',
  success: 'border-success-border bg-success-subtle text-success',
  warning: 'border-warning-border bg-warning-subtle text-warning',
  info: 'border-info-border bg-info-subtle text-info',
  danger: 'border-danger-border bg-danger-subtle text-danger',
}

export interface BadgeProps {
  tone?: BadgeTone
  children: ReactNode
  className?: string
}

/**
 * 상태 뱃지(세만틱 3단 대비). 색상 단독 구분 지양 원칙에 따라 반드시
 * 텍스트 라벨을 함께 노출한다. 근거: 4_color_system_rules.md §4.2
 */
export function Badge({ tone = 'neutral', children, className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded border px-2 py-0.5 text-caption font-medium',
        toneClass[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}
