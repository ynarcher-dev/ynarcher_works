import type { SelectHTMLAttributes } from 'react'
import { cn } from '../utils/cn'
import { useDensity, type Density } from '../density'
import {
  formBaseClass,
  formHeightClass,
  formInvalidClass,
  formPadWithIcon,
} from '../formDensity'

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean
  /** 밀도 맥락 강제 지정. 생략하면 부모 Card·DataTable이 내려준 맥락을 따른다. */
  density?: Density
}

/** 셀렉트 박스(4상태, 커스텀 화살표). 같은 줄의 Input·Button과 높이를 공유한다. */
export function Select({ invalid, density, className, children, ...props }: SelectProps) {
  const d = useDensity(density)
  const arrowSize = d === 'page' ? 16 : d === 'card' ? 14 : 12
  return (
    <div className="relative flex w-full items-center">
      <select
        aria-invalid={invalid}
        className={cn(
          formBaseClass,
          'appearance-none',
          formHeightClass[d],
          formPadWithIcon[d].right,
          invalid && formInvalidClass,
          className,
        )}
        {...props}
      >
        {children}
      </select>
      {/* 커스텀 화살표 아이콘 */}
      <span
        className={cn(
          'pointer-events-none absolute shrink-0 text-gray-400',
          d === 'table' ? 'right-2' : d === 'card' ? 'right-3' : 'right-3.5',
        )}
        aria-hidden="true"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width={arrowSize}
          height={arrowSize}
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
