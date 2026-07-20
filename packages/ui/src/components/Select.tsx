import type { SelectHTMLAttributes } from 'react'
import { cn } from '../utils/cn'

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean
}

/** 셀렉트 박스(4상태, 커스텀 화살표, 토스 스타일). */
export function Select({ invalid, className, children, ...props }: SelectProps) {
  return (
    <div className="relative flex w-full items-center">
      <select
        aria-invalid={invalid}
        className={cn(
          'h-11 w-full appearance-none rounded-radius-md border pl-3.5 pr-10 text-body text-gray-900 transition-all duration-fast shadow-soft',
          'bg-white border-gray-300',
          'hover:border-gray-400',
          'focus-visible:outline-none focus-visible:border-brand/50 focus-visible:shadow-popover',
          'disabled:cursor-not-allowed disabled:border-gray-100 disabled:bg-gray-50 disabled:text-gray-400 disabled:shadow-none',
          invalid
            ? 'border-danger-700 bg-danger-subtle hover:border-danger-700 focus-visible:border-danger-700 focus-visible:shadow-popover'
            : '',
          className,
        )}
        {...props}
      >
        {children}
      </select>
      {/* 커스텀 화살표 아이콘 */}
      <span className="absolute right-3.5 pointer-events-none text-gray-400 shrink-0" aria-hidden="true">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </span>
    </div>
  )
}
