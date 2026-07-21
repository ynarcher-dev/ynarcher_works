import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react'
import { cn } from '../utils/cn'
import { useDensity, type Density } from '../density'
import { toggleScale } from '../densityScale'

export interface RadioProps extends InputHTMLAttributes<HTMLInputElement> {
  /**
   * 라디오 오른쪽 라벨. 지정하면 `<label>`로 감싸 클릭 영역을 라벨까지 넓힌다.
   * 라디오는 단독으로 서는 일이 없으므로 라벨 동봉이 기본 사용법이다.
   */
  label?: ReactNode
  /** 밀도 맥락 강제 지정. 생략하면 부모 Card·DataTable의 맥락을 따른다. */
  density?: Density
  /** 라벨 래퍼(`<label>`)에 붙일 클래스. `className`은 input 자신에게 간다. */
  wrapperClassName?: string
}

/** 단일 선택 라디오(브랜드 강조). 근거: 5_component_spec_rules.md §2.3 */
export const Radio = forwardRef<HTMLInputElement, RadioProps>(function Radio(
  { className, wrapperClassName, label, density, disabled, title, ...props },
  ref,
) {
  const s = toggleScale[useDensity(density)]
  // 비활성 input은 브라우저가 마우스 이벤트를 삼켜 title이 뜨지 않는다. 라벨이 있으면 래퍼가 받는다.
  const input = (
    <input
      ref={ref}
      type="radio"
      disabled={disabled}
      title={label == null ? title : undefined}
      className={cn(
        // align-middle: 인라인 요소인 input이 글자 베이스라인에 걸려 위로 뜨는 것을 막는다.
        'shrink-0 align-middle border-gray-300 text-brand accent-brand shadow-sm',
        'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/10',
        'disabled:cursor-not-allowed disabled:opacity-60',
        s.box,
        className,
      )}
      {...props}
    />
  )

  if (label == null) return input

  return (
    <label
      className={cn(
        'inline-flex items-center',
        s.gap,
        s.text,
        disabled ? 'cursor-not-allowed text-gray-400' : 'cursor-pointer text-gray-800',
        wrapperClassName,
      )}
    >
      {input}
      {label}
    </label>
  )
})
