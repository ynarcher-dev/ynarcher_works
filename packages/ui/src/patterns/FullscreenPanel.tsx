import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '../utils/cn'
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
 * 있었고(사업 모듈 보드·포트폴리오 보드), 복제본은 카드 맥락 규격(14px·px-3)이 아니라
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
  /**
   * 사이드바까지 덮을지(기본 `true`).
   *
   * `false`면 본문 자리만 덮고 **사이드바는 그대로 남는다** — 넓게 펼친 목록을 보는 중에도 다른
   * 메뉴로 갈 수 있어야 하는 화면이 있다. 이때는 화면을 가둔 대화가 아니므로 `aria-modal`과
   * 탭 가두기를 함께 걷는다(보이는 사이드바를 키보드로는 못 가는 상태를 만들지 않기 위해서다).
   * Esc로 닫는 것은 두 경우 모두 같다.
   */
  coverSidebar?: boolean
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
  coverSidebar = true,
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
      // 사이드바를 남겨 둔 경우에는 탭을 가두지 않는다 — 화면에 보이는데 키보드로는 닿지 못하는
      // 자리를 만들지 않기 위해서다.
      if (e.key !== 'Tab' || !coverSidebar) return
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
  }, [open, onClose, coverSidebar])

  if (!open) return null

  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-modal={coverSidebar || undefined}
      aria-labelledby={titleId}
      tabIndex={-1}
      className={cn(
        'fixed inset-y-0 right-0 left-0 z-fullscreen flex flex-col bg-gray-25 focus:outline-none',
        // 사이드바 폭은 셸이 주입하는 `--app-sidebar-w`(펼침 15rem/접힘 4rem)를 따른다 —
        // 접었다 폈다 해도 덮는 경계가 사이드바와 함께 움직인다.
        !coverSidebar && 'lg:left-[var(--app-sidebar-w,15rem)]',
      )}
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
