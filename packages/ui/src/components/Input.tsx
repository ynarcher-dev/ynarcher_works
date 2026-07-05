import type { InputHTMLAttributes } from 'react'
import { cn } from '../utils/cn'

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean
}

/** 텍스트 입력(기본/포커스/비활성/오류 4상태). 근거: 4_color_system_rules.md §5.2 */
export function Input({ invalid, className, ...props }: InputProps) {
  return (
    <input
      aria-invalid={invalid}
      className={cn(
        'h-10 w-full rounded border bg-white px-3 text-body text-gray-800 transition-colors duration-fast',
        'placeholder:text-gray-400',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30',
        'disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-400',
        invalid
          ? 'border-brand-700 focus-visible:border-brand-700'
          : 'border-gray-300 focus-visible:border-brand',
        className,
      )}
      {...props}
    />
  )
}
