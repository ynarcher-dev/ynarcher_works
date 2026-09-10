import type { SelectHTMLAttributes } from 'react'
import { cn } from '../utils/cn'
import { useDensity, type Density } from '../density'
import {
  controlIconPad,
  controlScale,
  formBaseClass,
  formInvalidClass,
} from '../densityScale'

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean
  /** 밀도 맥락 강제 지정. 생략하면 부모 Card·DataTable이 내려준 맥락을 따른다. */
  density?: Density
}

/**
 * 셀렉트 박스(4상태, 커스텀 화살표). 같은 줄의 Input·Button과 높이를 공유한다.
 *
 * **`className`은 껍데기가 받는다**(2026-09-10). 화살표를 얹으려고 감싼 `div`가 이 컨트롤의
 * 실제 자리이므로, 폭 클래스가 안쪽 `select`에만 걸리면 **글자 상자와 화살표가 갈라선다** —
 * 껍데기는 `w-full`로 줄을 다 차지한 채 서고 그 오른쪽 끝에 화살표만 덩그러니 남아, 옆 칸까지
 * 밀려난다(미디어 입력 줄에서 드러났다). 안쪽은 언제나 껍데기를 꽉 채우고 폭·정렬은 부르는 쪽이
 * 준 클래스가 정한다.
 */
export function Select({ invalid, density, className, children, ...props }: SelectProps) {
  const d = useDensity(density)
  const s = controlScale[d]
  const arrowSize = d === 'page' ? 16 : d === 'card' ? 14 : 12
  return (
    <div className={cn('relative flex w-full items-center', className)}>
      <select
        aria-invalid={invalid}
        className={cn(
          formBaseClass,
          'w-full appearance-none',
          s.height,
          s.text,
          controlIconPad[d].trailing,
          invalid && formInvalidClass,
        )}
        {...props}
      >
        {children}
      </select>
      {/* 커스텀 화살표 아이콘 */}
      <span
        className={cn(
          'pointer-events-none absolute shrink-0 text-gray-400',
          controlIconPad[d].iconRight,
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
