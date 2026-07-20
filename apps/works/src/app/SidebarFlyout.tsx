import { SidebarItem } from '@ynarcher/ui'
import { ChevronRight } from 'lucide-react'
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/**
 * 팝오버 메뉴 상단의 섹션 라벨(워크스페이스 전환 메뉴 groupLabel과 동일 규격).
 * 사이드바에서 뻗는 모든 패널이 같은 머리글을 갖도록 공유한다.
 */
export function MenuSectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="px-3 pb-1 pt-1">
      <span className="text-caption font-semibold text-gray-400">{children}</span>
    </div>
  )
}

export interface SidebarFlyoutProps {
  icon?: ReactNode
  label: string
  /** 하위 항목 중 활성이 있으면 트리거를 활성 표시한다. */
  active?: boolean
  /** 사이드바 접힘 여부. 펼침 상태에서는 라벨과 우측 화살표를 함께 노출한다. */
  collapsed?: boolean
  /**
   * 열림 상태(제어 컴포넌트). 사이드바(`z-sidebar: 300`)가 팝오버 백드롭(`z-dropdown: 100`)보다
   * 위에 있어 백드롭만으로는 다른 트리거 클릭을 가로챌 수 없다. 따라서 "한 번에 하나만 열림"은
   * 상위(WorksLayout)에서 단일 상태로 강제한다.
   */
  open: boolean
  onOpenChange: (open: boolean) => void
  /** 플라이아웃 안에 렌더할 메뉴 항목들(DropdownItem 규격). */
  children: ReactNode
}

/**
 * 사이드바 항목에서 우측으로 펼치는 하위 메뉴 패널.
 *
 * 워크스페이스 전환·계정 메뉴와 **같은 팝오버 규격**(흰 패널 · radius.md · border-gray-300 ·
 * shadow.popover)과 **같은 조작감**(클릭으로 열고, 바깥을 클릭하면 닫힘)을 쓴다.
 * 근거: 5_component_spec_rules.md §1.1(둥글기·그림자) / §3.1 주석(테두리 단일 톤).
 *
 * 사이드바의 overflow에 잘리지 않도록 포털 + fixed 위치로 렌더한다.
 */
export function SidebarFlyout({
  icon,
  label,
  active,
  collapsed = false,
  open,
  onOpenChange,
  children,
}: SidebarFlyoutProps) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const triggerRef = useRef<HTMLDivElement>(null)

  // 열릴 때 위치를 잡는다(스크롤·접힘 상태가 바뀌어도 최신 좌표 사용).
  // 가로 기준은 메뉴 항목이 아니라 **사이드바 바깥 테두리**다. 항목은 사이드바 안쪽 패딩(px-2)만큼
  // 들어가 있어 항목 기준으로 열면 패널이 사이드바에 걸쳐 보인다. 워크스페이스·계정 메뉴와
  // 같은 6px 간격을 쓴다.
  useLayoutEffect(() => {
    if (!open) return
    const trigger = triggerRef.current
    const rect = trigger?.getBoundingClientRect()
    if (!rect) return
    const sidebar = trigger?.closest('nav')?.getBoundingClientRect()
    setPos({ top: rect.top, left: (sidebar?.right ?? rect.right) + 6 })
  }, [open])

  return (
    <div ref={triggerRef}>
      <SidebarItem
        icon={icon}
        label={label}
        active={active}
        collapsed={collapsed}
        onClick={() => onOpenChange(!open)}
        trailing={
          <ChevronRight
            aria-hidden
            className={`size-4 text-white/75 transition-transform duration-fast ${
              open ? 'translate-x-0.5' : ''
            }`}
          />
        }
      />
      {open &&
        pos &&
        createPortal(
          <>
            {/* 바깥 클릭 닫기(Dropdown과 동일한 백드롭 방식). */}
            <div className="fixed inset-0 z-dropdown" onClick={() => onOpenChange(false)} aria-hidden />
            <div
              role="menu"
              style={{ position: 'fixed', top: pos.top, left: pos.left }}
              // 항목을 고르면 이동하므로 함께 닫는다.
              onClick={() => onOpenChange(false)}
              className="z-dropdown min-w-44 overflow-hidden rounded-radius-md border border-gray-300 bg-white p-1 shadow-popover"
            >
              <MenuSectionLabel>{label}</MenuSectionLabel>
              {children}
            </div>
          </>,
          document.body,
        )}
    </div>
  )
}
