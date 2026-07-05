import type { ReactNode } from 'react'
import { cn } from '../utils/cn'

export type BannerTone = 'success' | 'warning' | 'info' | 'danger'

const toneClass: Record<BannerTone, string> = {
  success: 'border-success-border bg-success-subtle text-success',
  warning: 'border-warning-border bg-warning-subtle text-warning',
  info: 'border-info-border bg-info-subtle text-info',
  danger: 'border-danger-border bg-danger-subtle text-danger',
}

export interface BannerProps {
  tone?: BannerTone
  children: ReactNode
  className?: string
}

/** 인라인 배너(폼/화면 상단 알림). */
export function Banner({ tone = 'info', children, className }: BannerProps) {
  return (
    <div
      role="status"
      className={cn(
        'rounded-radius-md border px-3 py-2 text-body shadow-soft',
        toneClass[tone],
        className,
      )}
    >
      {children}
    </div>
  )
}
