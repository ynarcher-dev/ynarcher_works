import type { ReactNode } from 'react'
import { cn } from '../utils/cn'

export interface SidebarProps {
  header?: ReactNode
  children: ReactNode
  className?: string
  collapsed?: boolean
}

/** 사이드바 컨테이너(밝은 배경 표준). 근거: 2_app_layout_navigation.md */
export function Sidebar({
  header,
  children,
  className,
  collapsed = false,
}: SidebarProps) {
  return (
    <nav
      className={cn(
        'flex h-full flex-col border-r border-white/10 bg-gray-600 transition-[width] duration-300 ease-in-out',
        collapsed ? 'w-16' : 'w-60',
        className,
      )}
    >
      {header && (
        <div
          className={cn(
            'flex h-16 items-center',
            collapsed ? 'justify-center px-2' : 'px-4',
          )}
        >
          {!collapsed && header}
        </div>
      )}
      <div className="flex-1 space-y-1 overflow-y-auto px-2 py-2">
        {children}
      </div>
    </nav>
  )
}
