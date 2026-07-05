import { cn } from '../utils/cn'

export interface SpinnerProps {
  size?: 'sm' | 'md'
  className?: string
  label?: string
}

/** 로딩 스피너. */
export function Spinner({ size = 'md', className, label = '로딩 중' }: SpinnerProps) {
  return (
    <span
      role="status"
      aria-label={label}
      className={cn(
        'inline-block animate-spin rounded-full border-2 border-gray-200 border-t-brand',
        size === 'sm' ? 'size-4' : 'size-6',
        className,
      )}
    />
  )
}
