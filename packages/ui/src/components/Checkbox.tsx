import { forwardRef, type InputHTMLAttributes } from 'react'
import { cn } from '../utils/cn'
import { useDensity, type Density } from '../density'
import { toggleScale } from '../densityScale'

export interface CheckboxProps extends InputHTMLAttributes<HTMLInputElement> {
  /** 밀도 맥락 강제 지정. 생략하면 부모 Card·DataTable의 맥락을 따른다. */
  density?: Density
}

/** 체크박스(브랜드 강조). */
export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { className, density, ...props },
  ref,
) {
  const s = toggleScale[useDensity(density)]
  return (
    <input
      ref={ref}
      type="checkbox"
      className={cn(
        // align-middle: 인라인 요소인 input이 글자 베이스라인에 걸려 위로 뜨는 것을 막는다.
        'shrink-0 align-middle rounded border-gray-300 text-brand accent-brand shadow-sm',
        'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/10',
        'disabled:cursor-not-allowed disabled:opacity-60',
        s.box,
        className,
      )}
      {...props}
    />
  )
})
