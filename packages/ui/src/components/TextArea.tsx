import { forwardRef, type TextareaHTMLAttributes } from 'react'
import { cn } from '../utils/cn'

export interface TextAreaProps
  extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean
}

/** 여러 줄 입력(4상태). react-hook-form register가 동작하도록 ref를 forward한다. */
export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(function TextArea(
  { invalid, className, ...props },
  ref,
) {
  return (
    <textarea
      ref={ref}
      aria-invalid={invalid}
      className={cn(
        'w-full rounded-radius-md border px-3 py-2 text-body text-gray-900 shadow-soft transition-all duration-fast',
        'bg-white placeholder:text-gray-400',
        'hover:bg-white hover:border-gray-400',
        'focus-visible:bg-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/10',
        'disabled:cursor-not-allowed disabled:border-gray-100 disabled:bg-gray-50 disabled:text-gray-400 disabled:shadow-none',
        invalid
          ? 'border-brand-700 bg-danger-subtle hover:border-brand-700 focus-visible:border-brand-700'
          : 'border-gray-300 focus-visible:border-brand/50',
        className,
      )}
      {...props}
    />
  )
})
