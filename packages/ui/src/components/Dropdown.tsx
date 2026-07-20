import type { ReactNode } from 'react'
import { cn } from '../utils/cn'

export interface DropdownProps {
  open: boolean
  onClose: () => void
  trigger: ReactNode
  children: ReactNode
  align?: 'left' | 'center' | 'right'
  /**
   * 메뉴가 펼쳐지는 방향.
   * - `bottom`(기본)/`top`: 트리거 아래·위로 펼친다. 수평 위치는 `align`이 정한다.
   * - `right-start`/`right-end`: 트리거 오른쪽 옆으로 펼치고, 각각 트리거의 위/아래 모서리에
   *   맞춰 정렬한다. 사이드바처럼 폭이 좁은 영역의 메뉴가 본문을 가리지 않게 할 때 쓴다.
   *   이 두 값에서는 `align`이 무시된다.
   */
  placement?: 'bottom' | 'top' | 'right-start' | 'right-end'
  className?: string
  /** 래퍼를 블록으로 펼쳐 트리거가 부모 폭을 채우게 한다(사이드바 하단 계정 메뉴 등). */
  block?: boolean
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
  placement = 'bottom',
  className,
  block = false,
}: DropdownProps) {
  const toSide = placement === 'right-start' || placement === 'right-end'
  return (
    <div className={cn('relative', block ? 'block' : 'inline-block')}>
      {trigger}
      {open && (
        <>
          <div className="fixed inset-0 z-dropdown" onClick={onClose} aria-hidden />
          <div
            role="menu"
            className={cn(
              // 팝오버 패널 규격: radius.md · border-gray-300 · shadow.popover (5_component_spec_rules §1.1)
              'absolute z-dropdown min-w-40 overflow-hidden rounded-radius-md border border-gray-300 bg-white p-1 shadow-popover',
              placement === 'right-start' && 'left-full top-0 ml-1.5',
              placement === 'right-end' && 'left-full bottom-0 ml-1.5',
              placement === 'bottom' && 'mt-1.5',
              placement === 'top' && 'bottom-full mb-1.5',
              !toSide && align === 'right' && 'right-0',
              !toSide && align === 'left' && 'left-0',
              !toSide && align === 'center' && 'left-1/2 -translate-x-1/2',
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
      className="block w-full rounded-radius-md px-3 py-1.5 text-left text-body text-gray-800 transition-colors duration-fast hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/10 disabled:opacity-50"
    >
      {children}
    </button>
  )
}
