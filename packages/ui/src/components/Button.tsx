import type { ButtonHTMLAttributes } from 'react'
import { cn } from '../utils/cn'

export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'outline'
  | 'ghost'
  | 'danger'
export type ButtonSize = 'sm' | 'md'

const variantClass: Record<ButtonVariant, string> = {
  primary:
    'bg-brand !text-white shadow-sm shadow-brand/20 hover:bg-brand-600 active:bg-brand-700',
  secondary:
    'border border-transparent bg-gray-100 text-gray-800 shadow-sm hover:border-gray-300 hover:bg-white active:bg-gray-50',
  outline:
    'border border-gray-300 bg-white text-gray-800 shadow-sm hover:border-gray-400 hover:bg-gray-25 active:bg-gray-50',
  ghost: 'text-gray-700 hover:bg-gray-100 active:bg-gray-200',
  danger:
    'bg-brand-700 !text-white shadow-sm shadow-brand/20 hover:bg-brand-800 active:bg-brand-900',
}

const sizeClass: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-caption',
  md: 'h-10 px-4 text-body',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
}

/** 디자인 토큰 기반 버튼(5종 variant). 근거: 4_color_system_rules.md §5.1 */
export function Button({
  variant = 'primary',
  size = 'md',
  className,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded-radius-md font-semibold transition-all duration-fast ease-in-out whitespace-nowrap shrink-0',
        'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/10',
        'active:scale-[0.98] transform-gpu',
        'disabled:cursor-not-allowed disabled:opacity-55 disabled:shadow-none disabled:scale-100',
        variantClass[variant],
        sizeClass[size],
        className,
      )}
      {...props}
    />
  )
}
