import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '../utils/cn'

export type ModalSize = 'sm' | 'md' | 'lg' | 'xl'

const sizeClass: Record<ModalSize, string> = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
}

export interface ModalProps {
  open: boolean
  onClose: () => void
  title?: ReactNode
  size?: ModalSize
  children: ReactNode
  footer?: ReactNode
}

/**
 * 모달 다이얼로그(sm/md/lg). 딤 레이어 z-overlay, 바디 z-modal.
 * 근거: 8_z_index_system_rules.md, 6_motion_transition_rules.md §4.2
 */
export function Modal({
  open,
  onClose,
  title,
  size = 'md',
  children,
  footer,
}: ModalProps) {
  if (!open) return null
  return createPortal(
    <div className="fixed inset-0 z-overlay flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-gray-900/35 backdrop-blur-[2px] transition-opacity duration-slow ease-decelerate"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          // 헤더·푸터는 고정하고 본문만 스크롤되도록 flex 컬럼 + 최대 높이 제한(뷰포트-여백).
          'relative z-modal flex max-h-[calc(100vh-2rem)] w-full flex-col overflow-hidden rounded-radius-lg border border-white/70 bg-white shadow-2xl shadow-gray-900/15 transition-all duration-slow ease-decelerate',
          sizeClass[size],
        )}
      >
        {title && (
          <header className="shrink-0 border-b border-gray-200 bg-gray-25/70 px-5 py-3.5">
            <h2 className="text-title-sm font-medium text-gray-900">{title}</h2>
          </header>
        )}
        <div className="flex-1 overflow-y-auto px-5 py-4 text-body text-gray-800">
          {children}
        </div>
        {footer && (
          <footer className="shrink-0 flex justify-end gap-2 border-t border-gray-200 bg-gray-25/70 px-5 py-3.5">
            {footer}
          </footer>
        )}
      </div>
    </div>,
    document.body,
  )
}
