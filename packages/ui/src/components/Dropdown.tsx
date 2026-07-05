import type { ReactNode } from 'react'
import { cn } from '../utils/cn'

export interface DropdownProps {
  open: boolean
  onClose: () => void
  trigger: ReactNode
  children: ReactNode
  align?: 'left' | 'center' | 'right'
  className?: string
}

/**
 * 드롭다운(팝오버). 메뉴 z-dropdown, 바깥 클릭 시 닫힘.
 * 근거: 8_z_index_system_rules.md (z-dropdown=100)
 */
export function Dropdown({
  open,
  onClose,
  trigger,
  children,
  align = 'left',
  className,
}: DropdownProps) {
  return (
    <div className="relative inline-block">
      {trigger}
      {open && (
        <>
          <div className="fixed inset-0 z-dropdown" onClick={onClose} aria-hidden />
          <div
            role="menu"
            className={cn(
              'absolute z-dropdown mt-1.5 min-w-40 overflow-hidden rounded-radius-lg border border-gray-300 bg-white p-1 shadow-popover',
              align === 'right' && 'right-0',
              align === 'left' && 'left-0',
              align === 'center' && 'left-1/2 -translate-x-1/2',
              className,
            )}
          >
            {children}
          </div>
        </>
      )}
    </div>
  )
}

export interface DropdownItemProps {
  onClick?: () => void
  children: ReactNode
  disabled?: boolean
}

/** 드롭다운 항목. */
export function DropdownItem({ onClick, children, disabled }: DropdownItemProps) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      className="block w-full rounded-radius-md px-3 py-1.5 text-left text-body text-gray-800 transition-colors duration-fast hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-info/10 disabled:opacity-50"
    >
      {children}
    </button>
  )
}
