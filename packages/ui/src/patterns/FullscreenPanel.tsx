import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '../components/Button'

export interface ExpandToggleButtonProps {
  expanded: boolean
  onToggle: () => void
  /** 확대/축소 아이콘 노드(앱에서 주입). */
  expandIcon?: ReactNode
  collapseIcon?: ReactNode
  /**
   * 펼치기 쪽 라벨. 기본은 '확대보기'이며, 목록을 통째로 여는 카드는 '전체보기'를 쓴다.
   * 접기 쪽은 언제나 '축소'다 — 되돌리는 동작의 이름까지 카드마다 다를 이유가 없다.
   */
  expandLabel?: string
}

/**
 * 카드 헤더의 '확대보기/축소' 토글 버튼(아이콘 + 라벨).
 *
 * 외형은 손수 그리지 않고 `Button`의 outline을 쓴다 — 이 버튼이 정하는 것은 라벨과 아이콘이
 * 상태에 따라 뒤집힌다는 사실뿐이다. 손수 그리던 시절에는 같은 모양이 앱에도 두 벌 복제돼
 * 있었고(사업 모듈 보드·포트폴리오 보드), 복제본은 카드 맥락 규격(13px·px-3)이 아니라
 * 12px·px-2.5로 굳어 있어 바로 옆에 선 공식 버튼과 라벨 크기가 갈렸다.
 */
export function ExpandToggleButton({
  expanded,
  onToggle,
  expandIcon,
  collapseIcon,
  expandLabel = '확대보기',
}: ExpandToggleButtonProps) {
  const label = expanded ? '축소' : expandLabel
  return (
    <Button
      variant="outline"
      title={label}
      aria-label={label}
      aria-pressed={expanded}
      onClick={onToggle}
    >
      {expanded ? collapseIcon : expandIcon}
      <span>{label}</span>
    </Button>
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
  const panelRef = useRef<HTMLDivElement>(null)
  const titleId = useId()

  useEffect(() => {
    if (!open) return
    const previouslyFocused = document.activeElement as HTMLElement | null
    const panel = panelRef.current
    const focusable = () =>
      Array.from(
        panel?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      )
    requestAnimationFrame(() => (focusable()[0] ?? panel)?.focus())

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key !== 'Tab') return
      const items = focusable()
      if (items.length === 0) {
        e.preventDefault()
        panel?.focus()
        return
      }
      const first = items[0]!
      const last = items[items.length - 1]!
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      previouslyFocused?.focus()
    }
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      tabIndex={-1}
      className="fixed inset-0 z-fullscreen flex flex-col bg-gray-25 focus:outline-none"
    >
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-gray-200 bg-white px-5 py-3">
        <div id={titleId} className="flex min-w-0 items-center gap-2">{title}</div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </header>
      <div className="flex-1 overflow-y-auto px-6 py-6">{children}</div>
    </div>,
    document.body,
  )
}
