import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react'
import { cn } from '../utils/cn'

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean
  icon?: ReactNode
}

/** 텍스트 입력(기본/포커스/비활성/오류 4상태, 아이콘 슬롯 지원, 토스 스타일). ref는 input으로 forward. */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { invalid, icon, className, ...props },
  ref,
) {
  return (
    <div className="relative flex w-full items-center">
      {icon && (
        <span className="absolute left-3.5 text-gray-400 shrink-0">
          {icon}
        </span>
      )}
      <input
        ref={ref}
        aria-invalid={invalid}
        className={cn(
          'h-11 w-full rounded-radius-md border text-body text-gray-900 transition-all duration-fast shadow-soft',
          'bg-white border-gray-300 placeholder:text-gray-400',
          icon ? 'pl-10 pr-3.5' : 'px-3.5',
          'hover:border-gray-400',
          'focus-visible:outline-none focus-visible:border-info focus-visible:ring-4 focus-visible:ring-info/10',
          'disabled:cursor-not-allowed disabled:border-gray-100 disabled:bg-gray-50 disabled:text-gray-400 disabled:shadow-none',
          invalid
            ? 'border-danger bg-danger-subtle hover:border-danger focus-visible:border-danger focus-visible:ring-danger/10'
            : '',
          className,
        )}
        {...props}
      />
    </div>
  )
})
