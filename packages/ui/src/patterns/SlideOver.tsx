import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '../utils/cn'
import { DensityProvider } from '../density'

export interface SlideOverProps {
  open: boolean
  onClose: () => void
  children: ReactNode
  /**
   * 패널 폭(Tailwind width 클래스). 기본값은 좁은 화면 전체폭 → 넓은 화면에서 우측 1/3에
   * 근접하는 반응형 고정폭. 2:1 레이아웃의 "1"에 시각적으로 안착하도록 튜닝돼 있다.
   */
  widthClassName?: string
  /** 스크린리더용 라벨(패널 제목 텍스트). */
  label?: string
  className?: string
}

/**
 * 좁은 화면(lg 미만)은 전체폭, lg↑는 2:1 레이아웃의 "1"(우측 grid 트랙)에 정확히 안착한다.
 * 트랙폭 = (100vw − 사이드바 − main 좌우패딩 3rem − grid gap 2rem) / 3, 여기에 우측 패딩 1.5rem을
 * 더해 패널 좌측 모서리를 트랙 좌측에 맞춘다. 사이드바 폭은 `--app-sidebar-w`(펼침 15rem/접힘 4rem,
 * WorksLayout이 주입)를 참조해 접힘 상태에서도 어긋나지 않는다. 초대형 화면 과폭 방지로 42rem 상한.
 */
const DEFAULT_WIDTH =
  'w-full lg:w-[min(42rem,calc((100vw_-_var(--app-sidebar-w,15rem)_-_5rem)/3_+_1.5rem))]'

/**
 * 우측 슬라이드오버(전역 진입점 패널의 뼈대). 현재 화면 위에 우→좌로 밀려 나오며,
 * 뒤 화면 조작을 막지 않는다(비차단):
 *  - 딤 대신 아주 옅은 틴트로 뒤 화면이 "물러난" 느낌만 주고, 틴트는 `pointer-events-none`이라
 *    클릭이 그대로 통과한다.
 *  - 래퍼도 `pointer-events-none`이고 오직 패널(`aside`)만 클릭을 받으므로, 패널이 덮지 않는
 *    좌측 본문은 계속 조작할 수 있다.
 *  - z-panel(150)은 navbar(200)·sidebar(300)보다 낮아 상단바·사이드바가 위에 남는다. 덕분에
 *    패널을 연 채로 다른 진입점 버튼을 눌러 전환할 수 있고, 패널 상단은 상단바 뒤로 자연히 물린다.
 * 딤으로 막는 대화는 Modal, 다크 내비 드로어는 Drawer를 쓴다.
 * 근거: 6_motion_transition_rules.md §4.1(slide+fade), 8_z_index_system_rules.md
 */
export function SlideOver({
  open,
  onClose,
  children,
  widthClassName,
  label,
  className,
}: SlideOverProps) {
  // 닫힘 애니메이션이 끝날 때까지 마운트를 유지하고, 그동안 마지막 내용을 그대로 보여준다
  // (닫는 도중 children이 null이 되어도 패널이 비어 보이지 않도록).
  const [rendered, setRendered] = useState(open)
  const [cached, setCached] = useState<ReactNode>(children)

  useEffect(() => {
    if (open) {
      setRendered(true)
      setCached(children)
    }
  }, [open, children])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open && !rendered) return null

  return createPortal(
    // 포털은 DOM만 body로 옮기고 React 컨텍스트는 부모를 따르므로, 카드/표 안에서 열려도
    // 규격이 쪼그라들지 않게 밀도를 'page'로 되돌린다(Modal·Drawer와 동일).
    <DensityProvider value="page">
      {/* 래퍼는 항상 pointer-events-none — 오직 패널만 클릭을 받아 뒤 화면 조작을 막지 않는다. */}
      <div aria-hidden={!open} className="pointer-events-none fixed inset-0 z-panel">
        <div
          className={cn(
            'absolute inset-0 bg-gray-900/[0.04] transition-opacity duration-slow ease-decelerate',
            open ? 'opacity-100' : 'opacity-0',
          )}
        />
        <aside
          role="dialog"
          aria-label={label}
          onTransitionEnd={() => {
            if (!open) setRendered(false)
          }}
          className={cn(
            'pointer-events-auto absolute inset-y-0 right-0 flex flex-col overflow-hidden',
            'border-l border-gray-200 bg-white shadow-2xl shadow-gray-900/15',
            'rounded-l-radius-lg transition-transform duration-slow ease-decelerate',
            widthClassName ?? DEFAULT_WIDTH,
            open ? 'translate-x-0' : 'translate-x-full',
            className,
          )}
        >
          {cached}
        </aside>
      </div>
    </DensityProvider>,
    document.body,
  )
}
