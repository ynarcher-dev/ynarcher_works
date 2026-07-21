import type { ButtonHTMLAttributes } from 'react'
import { cn } from '../utils/cn'
import { useDensity, type Density } from '../density'

export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'outline'
  | 'ghost'
  | 'danger'

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
}

/**
 * 밀도 맥락별 치수. 크기 변형(`size`)은 두지 않는다 — 버튼의 위계는 크기가 아니라
 * variant(색)가 전담하고, 크기는 놓이는 자리가 정한다.
 * 근거: 5_component_spec_rules.md §1.2 / §2.1
 */
const densityClass: Record<Density, string> = {
  page: 'h-ctl-page gap-1.5 px-4 text-body',
  card: 'h-ctl-card gap-1.5 px-3.5 text-body-sm',
  table: 'h-ctl-table gap-1 px-2.5 text-caption',
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
  const d = useDensity(density)
  return (
    <button
      type={type}
      className={cn(
        'inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-radius-md font-semibold transition-all duration-fast ease-in-out',
        'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/10',
        'active:scale-[0.98] transform-gpu',
        'disabled:cursor-not-allowed disabled:opacity-55 disabled:shadow-none disabled:scale-100',
        variantClass[variant],
        densityClass[d],
        className,
      )}
      {...props}
    />
  )
}
