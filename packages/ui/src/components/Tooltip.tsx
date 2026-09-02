import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '../utils/cn'
import { useDensity, type Density } from '../density'
import { TOOLTIP_MAX_W, tooltipScale } from '../densityScale'

export type TooltipSide = 'top' | 'bottom'

export interface TooltipProps {
  /** 말풍선에 표시할 설명. 비어 있으면 아무것도 렌더링하지 않는다. */
  content?: ReactNode
  /** 트리거 노드. 미지정 시 기본 도움말(ⓘ) 아이콘을 사용한다. */
  children?: ReactNode
  /** 선호 방향. 화면 밖으로 넘칠 경우 자동으로 반대편으로 뒤집는다. */
  side?: TooltipSide
  /**
   * 트리거의 접근성 이름. 도움말 표식이 여럿 있는 화면에서 무엇에 대한 설명인지 구분한다
   * (예: `주관`). 미지정 시 `설명 보기`.
   */
  label?: string
  /** 아이콘 크기 맥락 강제. 미지정 시 부모(Card·DataTable)가 내려준 밀도를 따른다. */
  density?: Density
  className?: string
}

const GAP = 6
const EDGE = 8

/**
 * 도움말 말풍선 — works의 안내 문구가 사는 단 하나의 자리.
 *
 * 화면에 상시 노출하던 안내 캡션(라벨 아래 한 줄, 카드 제목 아래 부제)을 대체한다. 접는 기준과
 * 생김새의 근거는 `densityScale.ts`의 `tooltipScale` 주석에 있다. 요약하면 — 규칙 설명은 그 칸을
 * 채우려는 사람만 필요로 하므로 물어볼 때 답하고, **막힌 이유·빈 상태·오류는 접지 않는다.**
 *
 * 화면이 이 컴포넌트를 직접 놓는 일은 드물다. 폼 필드는 `Field`의 `hint`가, 설정 한 줄은
 * `SettingRow`의 `hint`가, 카드·섹션 제목은 `CardHeading`의 `help`가 대신 놓는다 — 안내가
 * 제목 줄 어디에 어떤 간격으로 서는지를 화면마다 다시 정하지 않게 하기 위해서다. 직접 쓰는
 * 자리는 그 셋 중 어디에도 속하지 않는 곳(차트 범례·표 셀 안 배지 등)뿐이다.
 *
 * 말풍선은 body 포털 + fixed 좌표로 띄우므로 상위 컨테이너의 overflow/stacking 에 잘리지 않는다.
 * 대신 좌표가 화면 기준이라 열려 있는 동안 스크롤·리사이즈를 따라 다시 계산한다 — 그러지 않으면
 * 긴 폼에서 스크롤하는 순간 말풍선만 제자리에 남아 엉뚱한 칸을 가리킨다.
 */
export function Tooltip({
  content,
  children,
  side = 'top',
  label,
  density,
  className,
}: TooltipProps) {
  const [pos, setPos] = useState<{ top: number; left: number; flipped: boolean } | null>(null)
  const triggerRef = useRef<HTMLSpanElement>(null)
  const id = useId()
  const d = useDensity(density)

  const place = useCallback(() => {
    const el = triggerRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    // 위쪽 공간이 부족하면 아래로(또는 그 반대로) 뒤집는다.
    const wantTop = side === 'top'
    const flipped = wantTop ? r.top < 80 : window.innerHeight - r.bottom < 80
    const useTop = wantTop !== flipped
    const left = Math.min(
      Math.max(r.left + r.width / 2, EDGE + TOOLTIP_MAX_W / 2),
      window.innerWidth - EDGE - TOOLTIP_MAX_W / 2,
    )
    setPos({ top: useTop ? r.top - GAP : r.bottom + GAP, left, flipped: !useTop })
  }, [side])

  const close = useCallback(() => setPos(null), [])
  const open = !!pos

  // 열려 있는 동안에만 창을 따라간다. 스크롤은 캡처 단계로 받는다 — 페이지가 아니라 모달
  // 본문처럼 안쪽 컨테이너가 스크롤될 때도 좌표가 낡지 않아야 한다.
  useEffect(() => {
    if (!open) return
    const onScroll = () => place()
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onScroll)
    const onKey = (e: KeyboardEvent) => {
      // Esc는 말풍선만 닫는다. 모달 안에서 열렸을 때 모달까지 함께 닫히면
      // 설명을 읽으려다 입력하던 폼을 잃는다.
      if (e.key === 'Escape') {
        e.stopPropagation()
        close()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onScroll)
      window.removeEventListener('keydown', onKey, true)
    }
  }, [open, place, close])

  if (!content) return null

  return (
    <>
      <span
        ref={triggerRef}
        tabIndex={0}
        role="button"
        aria-describedby={open ? id : undefined}
        aria-label={label ? `${label} 설명 보기` : '설명 보기'}
        aria-expanded={open}
        className={cn(
          'relative inline-flex cursor-help items-center align-middle outline-none',
          tooltipScale.trigger,
          className,
        )}
        onMouseEnter={place}
        onMouseLeave={close}
        onFocus={place}
        onBlur={close}
        // 호버가 없는 기기에서는 탭으로 연다. 안내가 오직 말풍선 안에만 있으므로
        // 터치 사용자가 열 방법이 없으면 그 문구는 존재하지 않는 것과 같다.
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          if (open) close()
          else place()
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            if (open) close()
            else place()
          }
        }}
      >
        {children ?? <InfoIcon className={tooltipScale.icon[d]} />}
      </span>
      {pos &&
        createPortal(
          <span
            id={id}
            role="tooltip"
            style={{ top: pos.top, left: pos.left }}
            className={cn(
              // z: 모달(z-modal=1010) 위에서도 보이도록 그보다 높인다(토스트 2000보다는 아래). 근거: 8_z_index_system_rules.md
              'pointer-events-none fixed z-popover -translate-x-1/2 whitespace-pre-line',
              tooltipScale.width,
              tooltipScale.surface,
              tooltipScale.text,
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

function InfoIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={className}
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
