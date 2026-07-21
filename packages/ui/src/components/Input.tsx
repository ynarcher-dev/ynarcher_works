import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react'
import { cn } from '../utils/cn'
import { useDensity, type Density } from '../density'
import {
  formBaseClass,
  formHeightClass,
  formInvalidClass,
  formPadClass,
  formPadWithIcon,
} from '../formDensity'

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean
  icon?: ReactNode
  /** 밀도 맥락 강제 지정. 생략하면 부모 Card·DataTable이 내려준 맥락을 따른다. */
  density?: Density
}

/** 텍스트 입력(기본/포커스/비활성/오류 4상태, 아이콘 슬롯 지원). ref는 input으로 forward. */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { invalid, icon, density, className, ...props },
  ref,
) {
  const d = useDensity(density)
  return (
    <div className="relative flex w-full items-center">
      {icon && (
        <span
          className={cn(
            'absolute shrink-0 text-gray-400',
            d === 'table' ? 'left-2' : d === 'card' ? 'left-2.5' : 'left-3.5',
          )}
        >
          {icon}
        </span>
      )}
      <input
        ref={ref}
        aria-invalid={invalid}
        className={cn(
          formBaseClass,
          formHeightClass[d],
          icon ? formPadWithIcon[d].left : formPadClass[d],
          invalid && formInvalidClass,
          className,
        )}
        {...props}
      />
    </div>
  )
})
