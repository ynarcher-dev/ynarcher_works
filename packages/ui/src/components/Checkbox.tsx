import type { InputHTMLAttributes } from 'react'
import { cn } from '../utils/cn'

export type CheckboxProps = InputHTMLAttributes<HTMLInputElement>

/** 체크박스(브랜드 강조). */
export function Checkbox({ className, ...props }: CheckboxProps) {
  return (
    <input
      type="checkbox"
      className={cn(
        'size-4 rounded border-gray-300 text-brand accent-brand',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30',
        'disabled:cursor-not-allowed disabled:opacity-60',
        className,
      )}
      {...props}
    />
  )
}
