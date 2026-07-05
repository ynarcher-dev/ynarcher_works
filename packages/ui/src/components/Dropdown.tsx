import type { ReactNode } from 'react'
import { cn } from '../utils/cn'

export interface DropdownProps {
  open: boolean
  onClose: () => void
  trigger: ReactNode
  children: ReactNode
  align?: 'left' | 'right'
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
              'absolute z-dropdown mt-1 min-w-40 rounded-md border border-gray-200 bg-white py-1 shadow-lg',
              align === 'right' ? 'right-0' : 'left-0',
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
      className="block w-full px-3 py-1.5 text-left text-body text-gray-800 hover:bg-gray-50 disabled:opacity-50"
    >
      {children}
    </button>
  )
}
