import type { ReactNode } from 'react'
import { cn } from '../utils/cn'

export interface SidebarItemProps {
  icon?: ReactNode
  label: string
  active?: boolean
  onClick?: () => void
}

/**
 * 사이드바 메뉴 항목. 활성 시 브랜드 하이라이트(red.25 배경 + brand 텍스트).
 * 근거: 4_color_system_rules.md (red.25 사이드바 활성 배경)
 */
export function SidebarItem({ icon, label, active, onClick }: SidebarItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex w-full items-center gap-2 rounded px-3 py-2 text-body font-medium transition-colors duration-fast',
        active
          ? 'bg-brand-25 text-brand'
          : 'text-gray-600 hover:bg-gray-100',
      )}
    >
      {icon && <span className="shrink-0">{icon}</span>}
      <span className="truncate">{label}</span>
    </button>
  )
}
