import type { ReactNode } from 'react'
import { cn } from '../utils/cn'

export interface DetailTopBarProps {
  /** 좌측 뒤로가기 액션(`TextAction as={Link} arrow="left"` 등). */
  back?: ReactNode
  /** 우측 영역(제목·상태 배지·편집 버튼 등). */
  actions?: ReactNode
  className?: string
}

/**
 * 상세 화면 상단 슬림 헤더(뒤로가기 ↔ 우측 액션 한 줄).
 * 탭바 없이 카드섹션으로 진입하는 상세 화면(AC 사업·M&A·프로젝트)에서 공통으로 사용한다.
 */
export function DetailTopBar({ back, actions, className }: DetailTopBarProps) {
  return (
    <div className={cn('flex items-center justify-between gap-3', className)}>
      <div className="flex min-w-0 items-center gap-2">{back}</div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  )
}
