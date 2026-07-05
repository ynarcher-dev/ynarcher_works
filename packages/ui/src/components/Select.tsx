import type { SelectHTMLAttributes } from 'react'
import { cn } from '../utils/cn'

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean
}

/** 셀렉트 박스(4상태). */
export function Select({ invalid, className, children, ...props }: SelectProps) {
  return (
    <select
      aria-invalid={invalid}
      className={cn(
        'h-10 w-full rounded border bg-white px-3 text-body text-gray-800 transition-colors duration-fast',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30',
        'disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-400',
        invalid
          ? 'border-brand-700 focus-visible:border-brand-700'
          : 'border-gray-300 focus-visible:border-brand',
        className,
      )}
      {...props}
    >
      {children}
    </select>
  )
}
