import type { ReactNode } from 'react'
import { cn } from '../utils/cn'

export interface SidebarProps {
  header?: ReactNode
  children: ReactNode
  className?: string
}

/** 사이드바 컨테이너(밝은 배경 표준). 근거: 2_app_layout_navigation.md */
export function Sidebar({ header, children, className }: SidebarProps) {
  return (
    <nav
      className={cn(
        'flex h-full w-60 flex-col border-r border-gray-200 bg-gray-50',
        className,
      )}
    >
      {header && (
        <div className="flex h-14 items-center px-4">{header}</div>
      )}
      <div className="flex-1 space-y-0.5 overflow-y-auto px-2 py-2">
        {children}
      </div>
    </nav>
  )
}
