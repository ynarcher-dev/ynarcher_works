import { useCallback, useId, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '../utils/cn'

export type TooltipSide = 'top' | 'bottom'

export interface TooltipProps {
  /** 말풍선에 표시할 설명. 비어 있으면 아무것도 렌더링하지 않는다. */
  content?: ReactNode
  /** 트리거 노드. 미지정 시 기본 정보(ⓘ) 아이콘을 사용한다. */
  children?: ReactNode
  /** 선호 방향. 화면 밖으로 넘칠 경우 자동으로 반대편으로 뒤집는다. */
  side?: TooltipSide
  className?: string
}

const GAP = 6
const MAX_W = 288 // max-w-[18rem]
const EDGE = 8

/**
 * 마우스 호버(및 키보드 포커스)로 열리는 설명 말풍선.
 * 화면에 상시 노출하던 부제(subtitle) 문구를 대체하는 용도로, 제목 옆에 아이콘 형태로 배치한다.
 * 말풍선은 body 포털 + fixed 좌표로 띄우므로 상위 컨테이너의 overflow/stacking 에 잘리지 않는다.
 */
export function Tooltip({ content, children, side = 'top', className }: TooltipProps) {
  const [pos, setPos] = useState<{ top: number; left: number; flipped: boolean } | null>(null)
  const triggerRef = useRef<HTMLSpanElement>(null)
  const id = useId()

  const open = useCallback(() => {
    const el = triggerRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    // 위쪽 공간이 부족하면 아래로(또는 그 반대로) 뒤집는다.
    const wantTop = side === 'top'
    const flipped = wantTop ? r.top < 80 : window.innerHeight - r.bottom < 80
    const useTop = wantTop !== flipped
    const left = Math.min(
      Math.max(r.left + r.width / 2, EDGE + MAX_W / 2),
      window.innerWidth - EDGE - MAX_W / 2,
    )
    setPos({ top: useTop ? r.top - GAP : r.bottom + GAP, left, flipped: !useTop })
  }, [side])

  const close = useCallback(() => setPos(null), [])

  if (!content) return null

  return (
    <>
      <span
        ref={triggerRef}
        tabIndex={0}
        role="button"
        aria-describedby={pos ? id : undefined}
        aria-label="설명 보기"
        className={cn(
          'relative inline-flex cursor-help items-center text-gray-400 outline-none transition-colors duration-fast hover:text-gray-600 focus-visible:text-gray-600',
          className,
        )}
        onMouseEnter={open}
        onMouseLeave={close}
        onFocus={open}
        onBlur={close}
      >
        {children ?? <InfoIcon />}
      </span>
      {pos &&
        createPortal(
          <span
            id={id}
            role="tooltip"
            style={{ top: pos.top, left: pos.left }}
            className={cn(
              // z: 모달(z-modal=1010) 위에서도 보이도록 그보다 높인다(토스트 2000보다는 아래). 근거: 8_z_index_system_rules.md
              'pointer-events-none fixed z-[1100] w-max max-w-[18rem] -translate-x-1/2 whitespace-pre-line rounded-radius-sm bg-gray-800 px-2.5 py-1.5 text-caption font-normal leading-snug text-white shadow-md',
              pos.flipped ? '' : '-translate-y-full',
            )}
          >
            {content}
          </span>,
          document.body,
        )}
    </>
  )
}

function InfoIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      className="h-3.5 w-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      aria-hidden="true"
    >
      <circle cx="8" cy="8" r="6.4" />
      <path d="M8 7.2v4" strokeLinecap="round" />
      <circle cx="8" cy="4.9" r="0.75" fill="currentColor" stroke="none" />
    </svg>
  )
}
