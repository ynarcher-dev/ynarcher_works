import { forwardRef, type TextareaHTMLAttributes } from 'react'
import { cn } from '../utils/cn'
import { useDensity, type Density } from '../density'
import { formBaseClass, formInvalidClass, textAreaScale } from '../densityScale'

export interface TextAreaProps
  extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean
  /** 밀도 맥락 강제 지정. 생략하면 부모 Card·DataTable이 내려준 맥락을 따른다. */
  density?: Density
}

/**
 * 여러 줄 입력(4상태). 높이는 `rows`가 정하므로 밀도는 **글자·여백**에만 반영한다.
 * 세로 크기를 고정하지 않는 유일한 폼 컨트롤이다.
 * react-hook-form register가 동작하도록 ref를 forward한다.
 */
export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(function TextArea(
  { invalid, density, className, ...props },
  ref,
) {
  const d = useDensity(density)
  return (
    <textarea
      ref={ref}
      aria-invalid={invalid}
      className={cn(
        formBaseClass,
        // 스펙 요구: 최소 높이 확보 + 세로 리사이즈 허용(가로는 레이아웃이 깨지므로 막는다).
        'min-h-[7.5rem] resize-y',
        textAreaScale[d],
        invalid && formInvalidClass,
        className,
      )}
      {...props}
    />
  )
})
