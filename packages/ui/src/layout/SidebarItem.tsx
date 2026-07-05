import type { ReactNode } from 'react'
import { cn } from '../utils/cn'

export interface SidebarItemProps {
  icon?: ReactNode
  label: string
  active?: boolean
  onClick?: () => void
  collapsed?: boolean
}

/**
 * 사이드바 메뉴 항목. 활성 시 어두운 배경 위에 흰 pill + 브랜드 텍스트로 표시한다.
 */
export function SidebarItem({
  icon,
  label,
  active,
  onClick,
  collapsed = false,
}: SidebarItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      title={collapsed ? label : undefined}
      className={cn(
        'group relative flex w-full items-center rounded-radius-md text-body font-semibold transition-all duration-fast active:scale-[0.98] transform-gpu',
        'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/20',
        collapsed ? 'h-10 justify-center px-0 py-0' : 'gap-2.5 px-3.5 py-2.5',
        active
          ? 'bg-white text-brand shadow-soft'
          : 'text-white/90 hover:bg-white/10 hover:text-white',
      )}
    >
      {/* 좌측 세로 인디케이터 바 */}
      <span
        className={cn(
          'absolute top-1/2 h-5 w-1 -translate-y-1/2 rounded-full transition-all duration-fast',
          collapsed ? 'left-0.5' : 'left-1',
          active
            ? 'bg-brand opacity-100'
            : 'bg-white opacity-0 group-hover:opacity-100',
        )}
        aria-hidden="true"
      />
      {icon && (
        <span className="flex size-5 shrink-0 items-center justify-center">
          {icon}
        </span>
      )}
      {!collapsed && <span className="truncate">{label}</span>}
    </button>
  )
}
