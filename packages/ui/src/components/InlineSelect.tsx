import type { SelectHTMLAttributes } from 'react'
import { cn } from '../utils/cn'

export interface InlineSelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean
}

/**
 * 컴팩트 셀렉트 박스. 데이터 테이블 셀 등 조밀한 컨텍스트에서 쓰는 축약형(h-8·caption)이며,
 * 폼 입력용 표준 `Select`(h-11)와 시각·용도를 구분한다. 표준 select 속성을 그대로 전달한다.
 */
export function InlineSelect({ invalid, className, children, ...props }: InlineSelectProps) {
  return (
    <div className="relative inline-flex items-center">
      <select
        aria-invalid={invalid}
        className={cn(
          'h-7 w-full appearance-none rounded-radius-sm border pl-2 pr-6 text-caption text-gray-900 transition-all duration-fast',
          'bg-white border-gray-300',
          'hover:border-gray-400',
          'focus-visible:outline-none focus-visible:border-brand/50 focus-visible:shadow-popover',
          'disabled:cursor-not-allowed disabled:border-gray-100 disabled:bg-gray-50 disabled:text-gray-400',
          invalid ? 'border-brand-700 focus-visible:border-brand-700 focus-visible:shadow-popover' : '',
          className,
        )}
        {...props}
      >
        {children}
      </select>
      {/* 커스텀 화살표 아이콘 */}
      <span
        className="pointer-events-none absolute right-1.5 shrink-0 text-gray-400"
        aria-hidden="true"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="12"
          height="12"
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
