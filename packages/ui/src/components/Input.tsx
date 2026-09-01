import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react'
import { cn } from '../utils/cn'
import { useDensity, type Density } from '../density'
import {
  controlIconPad,
  controlScale,
  formBaseClass,
  formInvalidClass,
} from '../densityScale'

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean
  icon?: ReactNode
  /** 밀도 맥락 강제 지정. 생략하면 부모 Card·DataTable이 내려준 맥락을 따른다. */
  density?: Density
}

/**
 * 수치 입력의 네이티브 증감 화살표를 지운다.
 *
 * 크롬은 이 화살표를 평소 `opacity:0`으로 감추지만 **폭은 계속 차지한다**(약 13px). 그래서 좁은
 * 수치 칸(투입률·협업비율 등 `w-16`)에서는 보이지 않는 위젯이 글자 자리를 빼앗아 `80`이
 * `8`처럼 잘려 보였다. 화살표 자체도 32px 컨트롤 안에서는 누를 수 없을 만큼 작아 실질적인 입력
 * 수단이 아니다 — 값은 키보드로 적고 범위는 `min`/`max`가 지킨다.
 */
const numberSpinnerReset =
  '[appearance:textfield] [&::-webkit-outer-spin-button]:m-0 [&::-webkit-outer-spin-button]:appearance-none ' +
  '[&::-webkit-inner-spin-button]:m-0 [&::-webkit-inner-spin-button]:appearance-none'

/** 텍스트 입력(기본/포커스/비활성/오류 4상태, 아이콘 슬롯 지원). ref는 input으로 forward. */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { invalid, icon, density, className, ...props },
  ref,
) {
  const d = useDensity(density)
  const s = controlScale[d]
  return (
    <div className="relative flex w-full items-center">
      {icon && (
        <span
          className={cn(
            'absolute shrink-0 text-gray-400',
            controlIconPad[d].iconLeft,
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
          s.height,
          s.text,
          icon ? controlIconPad[d].leading : s.padX,
          props.type === 'number' && numberSpinnerReset,
          invalid && formInvalidClass,
          className,
        )}
        {...props}
      />
    </div>
  )
})
