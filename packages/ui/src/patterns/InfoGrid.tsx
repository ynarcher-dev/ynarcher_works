import type { ReactNode } from 'react'
import { cn } from '../utils/cn'

export interface InfoFieldProps {
  label: string
  /** 값. `null`/`undefined`/빈 문자열이면 하이픈으로 대체한다. */
  value: ReactNode
  className?: string
}

/** 라벨: 값 한 줄. 상세 화면 전 워크스페이스(AC·M&A·프로젝트) 공용 규격. */
export function InfoField({ label, value, className }: InfoFieldProps) {
  const empty = value === null || value === undefined || value === ''
  return (
    <div className={cn('flex items-baseline gap-2', className)}>
      <span className="shrink-0 text-caption text-gray-400">{label}:</span>
      <span className="text-body text-gray-800">{empty ? '-' : value}</span>
    </div>
  )
}

export interface InfoGridProps {
  /** 열 수(기본 3열). 1열은 우측 패널 등 좁은 폭에서 사용한다. */
  columns?: 1 | 2 | 3
  className?: string
  children: ReactNode
}

/** `InfoField` 나열용 반응형 그리드. 모바일 1열 → 지정 열 수로 확장한다. */
export function InfoGrid({ columns = 3, className, children }: InfoGridProps) {
  return (
    <div
      className={cn(
        'grid grid-cols-1 gap-2.5',
        columns === 2 && 'sm:grid-cols-2',
        columns === 3 && 'sm:grid-cols-3',
        className,
      )}
    >
      {children}
    </div>
  )
}
