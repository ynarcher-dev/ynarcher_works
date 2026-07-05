import type { InputHTMLAttributes } from 'react'
import { cn } from '../utils/cn'

export type CheckboxProps = InputHTMLAttributes<HTMLInputElement>

/** 체크박스(브랜드 강조). */
export function Checkbox({ className, ...props }: CheckboxProps) {
  return (
    <input
      type="checkbox"
      className={cn(
        'size-4 rounded border-gray-300 text-brand accent-brand shadow-sm',
        'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/10',
        'disabled:cursor-not-allowed disabled:opacity-60',
        className,
      )}
      {...props}
    />
  )
}
