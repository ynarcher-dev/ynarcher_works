import type { ReactNode } from 'react'
import { cn } from '../utils/cn'

export interface SidebarItemProps {
  icon?: ReactNode
  label: string
  active?: boolean
  onClick?: () => void
  collapsed?: boolean
  /** 우측 끝에 표시할 요소(예: 아코디언 chevron). 접힘 상태에서는 표시하지 않는다. */
  trailing?: ReactNode
  /**
   * 항목 한 줄에 덧붙일 클래스. 화면이 크기·색을 마음대로 바꾸라는 뜻이 아니라, 밀도 격자와
   * **다른 축의 규칙**이 겹치는 자리를 위해 연다 — GUEST 앱은 모바일 우선이라 터치 영역
   * 하한(48px)이 따로 정해져 있다(3_9_workspace_guest.md §3, `GuestButton`과 같은 이유).
   */
  className?: string
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
  trailing,
  className,
}: SidebarItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      title={collapsed ? label : undefined}
      className={cn(
        'group relative flex w-full items-center rounded-radius-md text-body font-semibold transition-all duration-fast active:scale-[0.98]',
        'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/20',
        collapsed ? 'h-ctl-page justify-center px-0 py-0' : 'gap-2.5 px-3.5 py-2.5',
        active
          ? 'bg-white text-brand shadow-soft'
          : 'text-white hover:bg-white/15',
        className,
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
      {!collapsed && <span className="min-w-0 flex-1 truncate text-left">{label}</span>}
      {!collapsed && trailing && (
        <span className="flex shrink-0 items-center">{trailing}</span>
      )}
    </button>
  )
}
