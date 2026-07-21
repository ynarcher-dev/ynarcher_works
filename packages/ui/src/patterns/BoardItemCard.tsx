import type { ReactNode } from 'react'
import { cn } from '../utils/cn'

export interface BoardItemCardProps {
  /** 좌측 리딩 심볼(이모지·아이콘). 미지정 시 제목부터 시작한다. */
  leading?: ReactNode
  title: ReactNode
  /** 제목 우측 배지 묶음(상태·공개범위·분류 등). */
  badges?: ReactNode
  /** 본문 한 줄 설명(메모·요약). */
  description?: ReactNode
  /** 하단 구분선 아래 메타 정보(기간·담당자 등). */
  meta?: ReactNode
  /** 카드 우상단 상시 노출 액션(설정·끄기 등). 카드 클릭과 분리된 레이어로 렌더한다. */
  actions?: ReactNode
  onClick?: () => void
  className?: string
}

/**
 * 보드/리스트 항목 카드(AC 운영 모듈 카드 규격).
 * 카드 전체가 클릭 영역이고, 우상단 액션은 별도 레이어에 놓여 클릭이 겹치지 않는다.
 * M&A 딜·프로젝트 태스크 등 동일한 정보 밀도의 항목 목록에 재사용한다.
 */
export function BoardItemCard({
  leading,
  title,
  badges,
  description,
  meta,
  actions,
  onClick,
  className,
}: BoardItemCardProps) {
  return (
    <div className={cn('group relative', className)}>
      <button
        type="button"
        onClick={onClick}
        className="w-full rounded-radius-md border border-gray-300 bg-white px-4 py-3 text-left transition-colors duration-fast hover:border-gray-400 hover:bg-gray-25"
      >
        {/* 우상단 액션과 겹치지 않도록 우측 여백을 확보한다. */}
        <span
          className={cn(
            'flex min-w-0 flex-wrap items-center gap-2',
            actions && 'pr-16',
          )}
        >
          {leading && (
            <span
              className="grid h-7 w-7 shrink-0 place-items-center rounded-radius-sm bg-gray-50 text-base leading-none"
              aria-hidden
            >
              {leading}
            </span>
          )}
          <span className="text-body font-semibold text-gray-900">{title}</span>
          {badges}
        </span>
        {description !== undefined && (
          <span className="mt-2 block text-body text-gray-700">{description}</span>
        )}
        {meta && (
          <span className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-0.5 border-t border-gray-200 pt-2 text-body text-gray-700">
            {meta}
          </span>
        )}
      </button>
      {actions && (
        <span className="absolute right-3 top-3 flex items-center gap-1.5">
          {actions}
        </span>
      )}
    </div>
  )
}

/** 보드 항목이 하나도 없을 때의 인라인 안내 박스(카드 목록과 동일 폭). */
export function BoardEmptyRow({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-radius-md border border-gray-200 bg-gray-25 px-4 py-6 text-center text-body text-gray-500">
      {children}
    </div>
  )
}
