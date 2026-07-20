import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

export interface ExpandToggleButtonProps {
  expanded: boolean
  onToggle: () => void
  /** 확대/축소 아이콘 노드(앱에서 주입). */
  expandIcon?: ReactNode
  collapseIcon?: ReactNode
}

/** 카드 헤더의 '확대보기/축소' 토글 버튼(아이콘 + 라벨). */
export function ExpandToggleButton({
  expanded,
  onToggle,
  expandIcon,
  collapseIcon,
}: ExpandToggleButtonProps) {
  const label = expanded ? '축소' : '확대보기'
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={expanded}
      onClick={onToggle}
      className="flex h-8 items-center gap-1.5 rounded-radius-md border border-gray-300 bg-white px-2.5 text-caption font-medium text-gray-500 transition-colors duration-fast hover:bg-gray-25 hover:text-gray-700"
    >
      {expanded ? collapseIcon : expandIcon}
      <span>{label}</span>
    </button>
  )
}

export interface FullscreenPanelProps {
  open: boolean
  onClose: () => void
  title: ReactNode
  /** 헤더 우측 액션(뷰 토글·축소 버튼 등). */
  actions?: ReactNode
  children: ReactNode
}

/**
 * 카드 본문을 전체 화면으로 펼치는 오버레이(포털 렌더 + Esc 닫기).
 * 보드·타임라인처럼 폭이 필요한 패널을 상세 레이아웃 밖으로 잠시 확대할 때 사용한다.
 * 근거: 8_z_index_system_rules.md (모달 계열 상위 레이어)
 */
export function FullscreenPanel({
  open,
  onClose,
  title,
  actions,
  children,
}: FullscreenPanelProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-[500] flex flex-col bg-gray-25">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-gray-200 bg-white px-5 py-3">
        <div className="flex min-w-0 items-center gap-2">{title}</div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </header>
      <div className="flex-1 overflow-y-auto px-6 py-6">{children}</div>
    </div>,
    document.body,
  )
}
