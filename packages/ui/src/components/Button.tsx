import type { ButtonHTMLAttributes } from 'react'
import { cn } from '../utils/cn'
import { useDensity, type Density } from '../density'
import { controlScale } from '../densityScale'

export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'outline'
  | 'ghost'
  | 'danger'
  | 'outline-danger'

/*
 * 버튼에는 그림자를 두지 않는다(2026-08-20 정책 반영).
 *
 * 쉬고 있는 표면은 그림자가 아니라 헤어라인 테두리와 면의 색차로 구획한다는 결정을 내리면서
 * `shadow-soft` 토큰을 투명으로 바꿨는데, 정작 버튼들은 그 토큰이 아니라 Tailwind 기본
 * `shadow-sm`을 직접 쓰고 있어 정책이 닿지 않았다. 그래서 카드·표는 평평해졌는데 그 위의
 * 버튼만 예전 그림자를 달고 떠 있었고, 한 화면 안에서 표면의 규칙이 두 개로 갈렸다.
 *
 * 버튼이 눌리는 것임은 면색과 테두리가 이미 말한다. 그림자는 떠 있는 요소(모달·드로어·팝오버·
 * 툴팁)만의 것이며, 그 값도 직접 적지 않고 `shadow-dialog`·`shadow-popover` 토큰이 소유한다.
 *
 * 상태색은 정본(4_color_system_rules.md §5.1)을 그대로 옮긴 것이다. 값을 고칠 일이 생기면
 * 여기가 아니라 그 문서를 먼저 고친다.
 *
 * 채움 계열(secondary)은 호버에서 **진해지고**, 테두리 계열(outline)은 흰 바탕이 옅게 물든다.
 * 한동안 secondary가 반대로(호버에서 `bg-white`로 밝아지게) 구현돼 있었는데, 그러면 같은 줄에
 * 선 secondary와 outline이 호버 순간 서로 같은 모양이 되어 둘을 가르던 위계가 사라졌다.
 *
 * 호버 배경에 `gray.25`를 쓰지 않는 이유도 정본에 있다 — 그 단계는 리스트 행 호버 전용이라,
 * 표 안의 버튼이 행 호버와 같은 색이 되면 무엇을 짚고 있는지 알 수 없게 된다.
 */
export const buttonVariantClass: Record<ButtonVariant, string> = {
  primary: 'bg-brand text-white hover:bg-brand-600 active:bg-brand-700',
  // 테두리 폭만 차지하는 투명 테두리 — outline과 나란히 섰을 때 높이가 1px씩 어긋나지 않게 한다.
  secondary:
    'border border-transparent bg-gray-100 text-gray-800 hover:bg-gray-200 active:bg-gray-300',
  outline:
    'border border-gray-300 bg-white text-gray-800 hover:bg-gray-50 active:bg-gray-100',
  ghost: 'text-gray-700 hover:bg-gray-100 active:bg-gray-200',
  danger: 'bg-danger-700 text-white hover:bg-danger-800 active:bg-danger-900',
  // 평소에는 다른 액션과 같은 무게로 서 있다가 호버에서만 위험색을 드러낸다.
  // 표의 '비활성화'처럼 행마다 반복되는 파괴적 액션용 — 빨간 버튼이 목록에 깔리는 것을 피한다.
  'outline-danger':
    'border border-gray-300 bg-white text-gray-800 hover:border-danger-border hover:bg-danger-subtle hover:text-danger active:bg-danger-subtle',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  /**
   * 밀도 맥락 강제 지정. 생략하면 부모 Card·DataTable이 내려준 맥락을 자동으로 따른다
   * (그게 정상 경로다). 카드 안이지만 페이지급 강조가 필요한 예외에서만 명시한다.
   */
  density?: Density
}

/** 디자인 토큰 기반 버튼(6종 variant). 근거: 4_color_system_rules.md §5.1 */
export function Button({
  variant = 'primary',
  density,
  className,
  type = 'button',
  ...props
}: ButtonProps) {
  const s = controlScale[useDensity(density)]
  return (
    <button
      type={type}
      className={cn(
        'inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-radius-md font-semibold transition-all duration-fast ease-in-out',
        'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/10',
        'active:scale-[0.98]',
        'disabled:cursor-not-allowed disabled:opacity-55 disabled:scale-100',
        buttonVariantClass[variant],
        s.height,
        s.text,
        s.padX,
        s.gap,
        className,
      )}
      {...props}
    />
  )
}
