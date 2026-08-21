import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react'
import { cn } from '../utils/cn'
import { useDensity, type Density } from '../density'
import { toggleScale } from '../densityScale'

export interface CheckboxProps extends InputHTMLAttributes<HTMLInputElement> {
  /**
   * 체크박스 오른쪽 라벨. 지정하면 `<label>`로 감싸 클릭 영역을 라벨까지 넓힌다.
   *
   * 이 슬롯이 없던 동안 works의 아홉 개 호출부가 저마다 `<label>`을 손으로 감쌌고, **간격이
   * 다섯 가지**(`gap-1`·`gap-1.5`·`gap-2`·`gap-x-2`·`gap-3`)**, 글자가 다섯 가지**로 갈렸다
   * (`text-body/gray-700`·`text-body/gray-800`·`text-body/gray-900`·`text-body font-medium/gray-800`·
   * `text-caption/gray-700`). 커서도 절반만 `cursor-pointer`였다. `Radio`에는 처음부터 이
   * 슬롯이 있어 그런 분화가 없었다 — 규격의 소유자가 있고 없고의 차이다.
   */
  label?: ReactNode
  /** 밀도 맥락 강제 지정. 생략하면 부모 Card·DataTable의 맥락을 따른다. */
  density?: Density
  /** 라벨 래퍼(`<label>`)에 붙일 클래스. `className`은 input 자신에게 간다. */
  wrapperClassName?: string
  /**
   * 라벨을 테두리 상자에 담아 '선택 카드'로 세운다(`label`이 있을 때만 뜻이 있다).
   *
   * 선택지가 길거나 여러 줄일 때 체크박스 하나만으로는 어디까지가 한 항목인지 눈이 끊지
   * 못한다. 이 형태를 화면이 손으로 만들던 두 자리는 테두리 색도(`brand` / `brand/40`),
   * 꺼짐 면도(`bg-white` / `bg-gray-25`), 여백도(`py-1.5` / `py-2`) 서로 달랐다 — 같은
   * 뜻의 상자가 화면을 옮기면 다른 것으로 읽혔다는 뜻이다.
   *
   * 글자 크기는 상자가 아니라 밀도 맥락이 정한다(`toggleScale`) — 상자에 담겼다고 규격이
   * 달라지지는 않는다.
   */
  boxed?: boolean
}

/** 체크박스(브랜드 강조). 근거: 5_component_spec_rules.md §2.3 */
export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { className, wrapperClassName, label, density, disabled, title, boxed, checked, ...props },
  ref,
) {
  const s = toggleScale[useDensity(density)]
  // 비활성 input은 브라우저가 마우스 이벤트를 삼켜 title이 뜨지 않는다. 라벨이 있으면 래퍼가 받는다.
  const input = (
    <input
      ref={ref}
      // eslint-disable-next-line no-restricted-syntax -- 선택 컨트롤의 정본. 이 input이 곧 규격이다.
      type="checkbox"
      disabled={disabled}
      checked={checked}
      title={label == null ? title : undefined}
      className={cn(
        // align-middle: 인라인 요소인 input이 글자 베이스라인에 걸려 위로 뜨는 것을 막는다.
        // eslint-disable-next-line no-restricted-syntax -- 체크박스만 `rounded`(§2.3) — 라디오의 완전 원형과 카드의 radius-lg 사이 어느 토큰도 이 크기에 맞지 않는다.
        'shrink-0 align-middle rounded border-gray-300 text-brand accent-brand',
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
      title={title}
      className={cn(
        'inline-flex items-center',
        s.gap,
        s.text,
        disabled ? 'cursor-not-allowed text-gray-400' : 'cursor-pointer text-gray-800',
        boxed && [
          'rounded-radius-md border px-3 py-1.5 transition-colors duration-fast',
          checked
            ? 'border-brand bg-brand-25 text-gray-900'
            : 'border-gray-300 bg-white hover:bg-gray-25',
          disabled && 'opacity-60 hover:bg-white',
        ],
        wrapperClassName,
      )}
    >
      {input}
      {label}
    </label>
  )
})
