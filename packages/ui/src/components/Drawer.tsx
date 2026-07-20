import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '../utils/cn'

export interface DrawerProps {
  open: boolean
  onClose: () => void
  side?: 'left' | 'right'
  children: ReactNode
  className?: string
}

/**
 * 드로어(모바일 사이드바 등). 딤 z-overlay, 패널 z-sidebar.
 * 근거: 6_motion_transition_rules.md §4.1 (slide + fade)
 */
export function Drawer({
  open,
  onClose,
  side = 'left',
  children,
  className,
}: DrawerProps) {
  if (!open) return null
  return createPortal(
    <div className="fixed inset-0 z-overlay">
      <div
        className="absolute inset-0 bg-gray-900/40 transition-opacity duration-slow ease-decelerate"
        onClick={onClose}
        aria-hidden
      />
      <aside
        className={cn(
          // 배경은 패널 내용(Sidebar 등)이 채운다. 자체 배경은 로딩 순간 비치는 바탕색만 담당.
          'absolute top-0 z-sidebar h-full w-60 bg-brand-800 shadow-xl transition-transform duration-slow ease-decelerate',
          side === 'left' ? 'left-0' : 'right-0',
          className,
        )}
      >
        {children}
      </aside>
    </div>,
    document.body,
  )
}
