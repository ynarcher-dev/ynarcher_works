import type { ReactNode } from 'react'
import { cn } from '../utils/cn'

export interface InfoFieldProps {
  label: string
  /** 값. `null`/`undefined`/빈 문자열이면 하이픈으로 대체한다. */
  value: ReactNode
  className?: string
  /** 값 표시 보정(말줄임 등). 긴 값이 열을 밀지 않도록 `truncate`를 줄 때 쓴다. */
  valueClassName?: string
}

/**
 * 라벨: 값 한 줄. 상세 화면 전 워크스페이스 공용 규격.
 *
 * 라벨과 값은 크기를 `text-body` 하나로 통일하고 위계는 색으로만 만든다. 한 줄 안에서 크기가
 * 갈리면 2px 차이도 '작은 글씨'가 아니라 다른 폰트로 읽혀, 정작 색으로 줘야 할 위계를 크기가
 * 가져가 버린다. 근거: densityScale.ts `tableText` — "크기는 하나, 구분은 굵기와 색으로만".
 */
export function InfoField({ label, value, className, valueClassName }: InfoFieldProps) {
  const empty = value === null || value === undefined || value === ''
  return (
    <div className={cn('flex items-baseline gap-2', className)}>
      <span className="shrink-0 text-body text-gray-500">{label}:</span>
      <span
        className={cn('text-body text-gray-900', valueClassName)}
        title={typeof value === 'string' ? value : undefined}
      >
        {empty ? '-' : value}
      </span>
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
