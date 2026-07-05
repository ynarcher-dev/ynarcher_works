import { SidebarItem } from '@ynarcher/ui'
import { useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

export interface SidebarFlyoutProps {
  icon?: ReactNode
  label: string
  /** 하위 항목 중 활성이 있으면 트리거 아이콘을 활성 표시한다. */
  active?: boolean
  /** 플라이아웃 안에 펼침 스타일로 렌더된 하위 SidebarItem들. */
  children: ReactNode
}

/**
 * 접힌 사이드바용 아코디언 대체 UI.
 * 트리거 아이콘에 호버하면 우측으로 하위 메뉴 플라이아웃을 띄운다.
 * 사이드바의 overflow에 잘리지 않도록 포털 + fixed 위치로 렌더한다.
 */
export function SidebarFlyout({ icon, label, active, children }: SidebarFlyoutProps) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const triggerRef = useRef<HTMLDivElement>(null)
  const hideTimer = useRef<number | undefined>(undefined)

  const show = () => {
    if (hideTimer.current) window.clearTimeout(hideTimer.current)
    const rect = triggerRef.current?.getBoundingClientRect()
    if (rect) setPos({ top: rect.top, left: rect.right + 6 })
    setOpen(true)
  }

  const scheduleHide = () => {
    hideTimer.current = window.setTimeout(() => setOpen(false), 120)
  }

  return (
    <div ref={triggerRef} onMouseEnter={show} onMouseLeave={scheduleHide}>
      <SidebarItem icon={icon} label={label} active={active} collapsed onClick={show} />
      {open &&
        pos &&
        createPortal(
          <div
            style={{ position: 'fixed', top: pos.top, left: pos.left }}
            onMouseEnter={show}
            onMouseLeave={scheduleHide}
            onClick={() => setOpen(false)}
            className="z-dropdown min-w-44 rounded-radius-md border border-white/10 bg-gray-600 p-1.5 shadow-popover"
          >
            <p className="px-2 pb-1 pt-0.5 text-caption font-semibold text-white/50">
              {label}
            </p>
            <div className="flex flex-col gap-1">{children}</div>
          </div>,
          document.body,
        )}
    </div>
  )
}
