import type { ReactNode } from 'react'
import { cn } from '../utils/cn'

export interface TopbarProps {
  onMenuClick?: () => void
  left?: ReactNode
  /** 상단바 정중앙에 고정 배치되는 슬롯(워크스페이스명 등). 좌/우 폭과 무관하게 화면 중앙 정렬. */
  center?: ReactNode
  right?: ReactNode
  className?: string
}

/** 상단바(56px, z-navbar). 근거: 2_app_layout_navigation.md, 8_z_index_system_rules.md */
export function Topbar({
  onMenuClick,
  left,
  center,
  right,
  className,
}: TopbarProps) {
  return (
    <header
      className={cn(
        'sticky top-0 z-navbar grid h-16 grid-cols-[1fr_auto_1fr] items-center border-b border-gray-100 bg-white/95 px-4 backdrop-blur',
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-2 justify-self-start">
        {onMenuClick && (
          <button
            type="button"
            onClick={onMenuClick}
            aria-label="메뉴 열기"
            className="rounded-radius-md p-1.5 text-gray-600 transition-colors duration-fast hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/10 lg:hidden"
          >
            <span aria-hidden className="text-title-sm leading-none">
              ☰
            </span>
          </button>
        )}
        {left}
      </div>
      <div className="min-w-0 justify-self-center">{center}</div>
      <div className="flex min-w-0 items-center justify-end gap-2 justify-self-end">
        {right}
      </div>
    </header>
  )
}
