import type { TextareaHTMLAttributes } from 'react'
import { cn } from '../utils/cn'

export interface TextAreaProps
  extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean
}

/** 여러 줄 입력(4상태). */
export function TextArea({ invalid, className, ...props }: TextAreaProps) {
  return (
    <textarea
      aria-invalid={invalid}
      className={cn(
        'w-full rounded border bg-white px-3 py-2 text-body text-gray-800 transition-colors duration-fast',
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
