import type { ReactNode } from 'react'
import { cn } from '../utils/cn'
import { useDensity, type Density } from '../density'
import { tagScale } from '../densityScale'

export type BadgeTone = 'neutral' | 'success' | 'warning' | 'info' | 'danger'

const toneClass: Record<BadgeTone, string> = {
  neutral: 'border-gray-300 bg-gray-50 text-gray-600',
  success: 'border-success-border bg-success-subtle text-success',
  warning: 'border-warning-border bg-warning-subtle text-warning',
  info: 'border-info-border bg-info-subtle text-info',
  danger: 'border-danger-border bg-danger-subtle text-danger',
}

export interface BadgeProps {
  tone?: BadgeTone
  /** 밀도 맥락 강제 지정. 생략하면 부모 Card·DataTable이 내려준 맥락을 자동으로 따른다. */
  density?: Density
  dot?: boolean
  children: ReactNode
  className?: string
}

/**
 * 상태 배지/태그. 크기는 단일 규격 하나뿐이다(§3.4).
 *
 * 크기 변형(size prop)을 두지 않는 이유: 배지가 전달하는 위계는 크기가 아니라 색(tone)이다.
 * 같은 종류의 정보를 크기로 나누면 "큰 태그 = 더 중요한 상태"라는 잘못된 신호를 준다.
 * 세로 크기는 세로 패딩이 아니라 고정 높이 + leading-none으로 확정한다 — 패딩만 주면 배지 높이가
 * 부모의 line-height 상속에 끌려다녀 같은 배지가 화면마다 다른 크기로 보인다.
 * 근거: 5_component_spec_rules.md §3.4
 */
export function Badge({ tone = 'neutral', density, dot = false, children, className }: BadgeProps) {
  const s = tagScale[useDensity(density)]
  const dotColorClass: Record<BadgeTone, string> = {
    neutral: 'bg-gray-400',
    success: 'bg-success',
    warning: 'bg-warning',
    info: 'bg-info',
    danger: 'bg-danger',
  }

  return (
    <span
      className={cn(
        // shrink-0 · whitespace-nowrap: 폭이 좁은 표 셀에서 찌그러지거나 줄바꿈으로 박스가 깨지지 않게 한다.
        'inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-radius-sm border font-medium leading-none transition-colors duration-fast',
        s.height,
        s.text,
        s.padX,
        toneClass[tone],
        className,
      )}
    >
      {dot && (
        <span
          className={cn('shrink-0 rounded-full', s.dot, dotColorClass[tone])}
          aria-hidden="true"
        />
      )}
      {children}
    </span>
  )
}
