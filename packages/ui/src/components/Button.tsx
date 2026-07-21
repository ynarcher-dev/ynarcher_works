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

const variantClass: Record<ButtonVariant, string> = {
  primary:
    'bg-brand !text-white shadow-sm shadow-brand/20 hover:bg-brand-600 active:bg-brand-700',
  secondary:
    'border border-transparent bg-gray-100 text-gray-800 shadow-sm hover:border-gray-300 hover:bg-white active:bg-gray-50',
  outline:
    'border border-gray-300 bg-white text-gray-800 shadow-sm hover:border-gray-400 hover:bg-gray-25 active:bg-gray-50',
  ghost: 'text-gray-700 hover:bg-gray-100 active:bg-gray-200',
  danger:
    'bg-danger-700 !text-white shadow-sm shadow-danger/20 hover:bg-danger-800 active:bg-danger-900',
  // 평소에는 다른 액션과 같은 무게로 서 있다가 호버에서만 위험색을 드러낸다.
  // 표의 '비활성화'처럼 행마다 반복되는 파괴적 액션용 — 빨간 버튼이 목록에 깔리는 것을 피한다.
  'outline-danger':
    'border border-gray-300 bg-white text-gray-800 shadow-sm hover:border-danger-border hover:bg-danger-subtle hover:text-danger active:bg-danger-subtle',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  /**
   * 밀도 맥락 강제 지정. 생략하면 부모 Card·DataTable이 내려준 맥락을 자동으로 따른다
   * (그게 정상 경로다). 카드 안이지만 페이지급 강조가 필요한 예외에서만 명시한다.
   */
  density?: Density
}

/** 디자인 토큰 기반 버튼(5종 variant). 근거: 4_color_system_rules.md §5.1 */
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
        'active:scale-[0.98] transform-gpu',
        'disabled:cursor-not-allowed disabled:opacity-55 disabled:shadow-none disabled:scale-100',
        variantClass[variant],
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
