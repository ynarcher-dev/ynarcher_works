import { cn } from '../utils/cn'
import { useDensity, type Density } from '../density'
import { spinnerScale } from '../densityScale'

export interface SpinnerProps {
  /** 밀도 맥락 강제 지정. 생략하면 부모 Card·DataTable의 맥락을 따른다. */
  density?: Density
  className?: string
  label?: string
}

/** 로딩 스피너. */
export function Spinner({ density, className, label = '로딩 중' }: SpinnerProps) {
  return (
    <span
      role="status"
      aria-label={label}
      className={cn(
        'inline-block animate-spin rounded-full border-2 border-gray-200 border-t-brand',
        spinnerScale[useDensity(density)],
        className,
      )}
    />
  )
}
