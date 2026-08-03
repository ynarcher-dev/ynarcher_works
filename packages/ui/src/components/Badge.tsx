import type { ReactNode } from 'react'
import { cn } from '../utils/cn'
import { useDensity, type Density } from '../density'
import { tagScale } from '../densityScale'

export type BadgeTone = 'neutral' | 'success' | 'warning' | 'info' | 'danger'

// 옅은 배경 + 같은 계열 1px 테두리로 형태를 잡는다(§3.4). 흰 카드 위에서 배경만으로는
// 윤곽이 서지 않아 태그가 글자 덩어리처럼 보이던 것을 테두리가 잡아준다.
const toneSubtleBg: Record<BadgeTone, string> = {
  neutral: 'bg-gray-50',
  success: 'bg-success-subtle',
  warning: 'bg-warning-subtle',
  info: 'bg-info-subtle',
  danger: 'bg-danger-subtle',
}

/**
 * 톤별 테두리 색. 배경보다 한 단계만 진한 같은 계열이라 선이 도드라지지 않는다.
 * 중립도 같은 관계(gray-50 위 gray-200)를 지켜 상태 톤보다 무겁게 읽히지 않게 한다 —
 * 중립이 제일 흔한데 선까지 제일 진하면 색이 만드는 위계가 뒤집힌다.
 */
export const badgeToneBorder: Record<BadgeTone, string> = {
  neutral: 'border-gray-200',
  success: 'border-success-border',
  warning: 'border-warning-border',
  info: 'border-info-border',
  danger: 'border-danger-border',
}

/**
 * 톤별 글자·아이콘 색. 배지 글자가 쓰고, 배지 밖에서 같은 톤으로 칠해야 하는 글리프
 * (상태 아이콘 등)도 이 표를 함께 쓴다 — badgeToneFill(면)과 같은 이유다.
 * 배지는 초록인데 그 상태를 가리키는 아이콘만 다른 초록이면 같은 상태가 두 색으로 보인다.
 */
export const badgeToneText: Record<BadgeTone, string> = {
  neutral: 'text-gray-600',
  success: 'text-success',
  warning: 'text-warning',
  info: 'text-info',
  danger: 'text-danger',
}

/**
 * 톤별 원색 배경. 배지 안의 점이 쓰고, 배지 밖에서 같은 톤으로 칠해야 하는 작은 면
 * (막대·진행 바 등)도 이 표를 함께 쓴다 — 배지는 초록인데 그 옆 막대만 다른 초록이면
 * 같은 상태가 두 색으로 보인다.
 */
export const badgeToneFill: Record<BadgeTone, string> = {
  neutral: 'bg-gray-400',
  success: 'bg-success',
  warning: 'bg-warning',
  info: 'bg-info',
  danger: 'bg-danger',
}

export interface BadgeProps {
  tone?: BadgeTone
  /** 밀도 맥락 강제 지정. 생략하면 부모 Card·DataTable이 내려준 맥락을 자동으로 따른다. */
  density?: Density
  dot?: boolean
  /**
   * 원색 배경 + 흰 글씨. 목록 안에서 "여기를 보라"고 외쳐야 하는 표식(NEW 등) 전용이다.
   * 상태 표시에는 쓰지 않는다 — 상태끼리 무게가 갈리면 색이 만드는 위계가 깨진다.
   */
  solid?: boolean
  children: ReactNode
  className?: string
  /** 마우스를 올렸을 때의 보조 설명(네이티브 tooltip). */
  title?: string
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
export function Badge({
  tone = 'neutral',
  density,
  dot = false,
  solid = false,
  children,
  className,
  title,
}: BadgeProps) {
  const s = tagScale[useDensity(density)]

  return (
    <span
      title={title}
      className={cn(
        // shrink-0 · whitespace-nowrap: 폭이 좁은 표 셀에서 찌그러지거나 줄바꿈으로 박스가 깨지지 않게 한다.
        // border는 톤과 무관하게 항상 1px 잡아둔다 — solid에서만 빼면 같은 줄의 배지끼리 높이가 어긋난다.
        'inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border font-medium leading-none transition-colors duration-fast',
        s.height,
        s.text,
        s.padX,
        solid
          ? cn('border-transparent text-gray-0', badgeToneFill[tone])
          : cn(toneSubtleBg[tone], badgeToneBorder[tone], badgeToneText[tone]),
        className,
      )}
    >
      {dot && (
        <span
          className={cn('shrink-0 rounded-full', s.dot, solid ? 'bg-gray-0' : badgeToneFill[tone])}
          aria-hidden="true"
        />
      )}
      {children}
    </span>
  )
}
