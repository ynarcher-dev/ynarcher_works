import type { ReactNode } from 'react'
import { cn } from '../utils/cn'

export interface TopbarProps {
  onMenuClick?: () => void
  left?: ReactNode
  right?: ReactNode
  className?: string
}

/** 상단바(56px, z-navbar). 근거: 2_app_layout_navigation.md, 8_z_index_system_rules.md */
export function Topbar({ onMenuClick, left, right, className }: TopbarProps) {
  return (
    <header
      className={cn(
        'sticky top-0 z-navbar flex h-14 items-center justify-between border-b border-gray-200 bg-white px-4',
        className,
      )}
    >
      <div className="flex items-center gap-2">
        {onMenuClick && (
          <button
            type="button"
            onClick={onMenuClick}
            aria-label="메뉴 열기"
            className="rounded p-1.5 text-gray-600 hover:bg-gray-100 lg:hidden"
          >
            <span aria-hidden className="text-title-sm leading-none">
              ☰
            </span>
          </button>
        )}
        {left}
      </div>
      <div className="flex items-center gap-2">{right}</div>
    </header>
  )
}
