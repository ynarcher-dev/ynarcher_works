import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '../utils/cn'
import { useDensity, type Density } from '../density'
import { controlIconPad, controlScale, formBaseClass, formInvalidClass } from '../densityScale'

export interface PickerFieldProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'value' | 'children' | 'className'> {
  /**
   * 무엇을 고르는 칸인가(`거래처명`·`예산 줄`). 화면에는 표 머리글이 이미 그 이름을 들고
   * 있으므로 여기서는 보이지 않게 두되, 버튼의 접근명은 이 문구로 시작한다 — 아이콘 버튼이
   * 아니라 값을 든 칸이라 `aria-label`로 이름을 덮으면 고른 값이 낭독에서 사라진다.
   */
  label: string
  /** 고른 값의 글자. 비어 있으면 `placeholder`가 대신 선다. */
  text?: string
  /** 아직 고르지 않은 칸의 안내(`거래처 선택`). 값이 아니므로 옅게 선다. */
  placeholder?: string
  /** 값 뒤에 서는 표식(확인 전 배지 등). 접근명에도 함께 읽힌다. */
  trailing?: ReactNode
  /**
   * 이 칸이 여는 창이 지금 열려 있는가. 창은 호출부가 가지므로 상태도 호출부가 알려 준다 —
   * 여는 곳을 `aria-haspopup`으로 알리면서 열렸는지를 말하지 않으면, 화면 낭독은 눌렀는데도
   * 아무 일이 없었던 것처럼 읽는다(`TokenMultiSelect`가 같은 한 쌍을 쓴다).
   * 생략하면 `aria-expanded`를 세우지 않는다.
   */
  open?: boolean
  /** 오류 상태. `aria-invalid`와 함께 테두리가 위험색으로 덮인다(Input·Select와 같은 규칙). */
  invalid?: boolean
  /** 밀도 맥락 강제 지정. 생략하면 부모 Card·DataTable이 내려준 맥락을 따른다. */
  density?: Density
  className?: string
}

/**
 * 돋보기 글리프. packages/ui는 아이콘 패키지에 의존하지 않는 것이 규약이라(IconButton은 앱이
 * 주입) `TokenMultiSelect`와 같은 형태를 인라인 SVG로 그린다.
 */
function SearchGlyph({ size }: { size: number }) {
  return (
    <svg
      aria-hidden
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  )
}

/**
 * **다른 원장에서 한 건을 골라 담는 칸.** 글자를 적는 자리가 아니라 창을 여는 자리다.
 *
 * 이 컴포넌트가 있는 이유는 그런 칸이 이미 여럿인데 **각자 손으로 그려져 있었기** 때문이다
 * (전자결재의 예산 줄·거래처 칸). 손으로 그린 칸은 `Input`·`Select`와 같은 줄에 서면서도
 * 모서리(`radius-sm` 대 `radius-md`)·높이·호버·초점 링·비활성 표시가 제각각이라, 한 표 안에서
 * 같은 층의 칸들이 서로 다른 물건처럼 보였다. 규격을 화면이 흉내 내면 결국 갈리므로
 * **외형은 폼 컨트롤과 같은 토큰 한 벌**(`formBaseClass` + `controlScale`)에서 가져온다.
 *
 * `Select`가 아닌 이유는 고르는 근거가 이름 하나가 아니기 때문이다 — 예산 줄은 남은 금액을
 * 보고 고르고 거래처는 계좌를 보고 고른다. 드롭다운 한 줄에는 그 값들이 들어가지 않으므로
 * 창이 열린다. 그래서 화살표(▾)가 아니라 **돋보기**가 선다: 이 칸이 여는 것은 펼침 목록이
 * 아니라 찾는 창이라는 뜻이다.
 *
 * 창 자체는 호출부가 갖는다(무엇을 고르는지에 따라 목록이 다르다). 여기가 갖는 것은 칸의
 * 외형·접근명·상태뿐이다.
 */
export function PickerField({
  label,
  text,
  placeholder,
  trailing,
  open,
  invalid,
  density,
  className,
  disabled,
  ...props
}: PickerFieldProps) {
  const d = useDensity(density)
  const s = controlScale[d]
  const pad = controlIconPad[d]
  const glyph = d === 'page' ? 16 : d === 'card' ? 14 : 12
  const filled = Boolean(text)

  return (
    <div className={cn('relative flex w-full items-center', className)}>
      <button
        type="button"
        // 눌러서 여는 것이 목록이 아니라 창이라는 사실을 보조기기에도 같은 말로 전한다.
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-invalid={invalid}
        disabled={disabled}
        className={cn(
          formBaseClass,
          // `formBaseClass`는 초점 표시를 테두리·그림자로 준다(Input·Select와 같은 4상태).
          // 버튼이라 `focus-visible:outline-none`이 이미 들어 있고, 여기서는 정렬만 더한다.
          'flex min-w-0 items-center text-left',
          s.height,
          s.text,
          pad.trailing,
          s.gap,
          invalid && formInvalidClass,
        )}
        {...props}
      >
        {/* 접근명은 `aria-label`이 아니라 **내용**이 만든다 — 그래야 "거래처명"과 고른 값이
            함께 읽힌다. 눈으로 보는 사람은 표 머리글에서 이미 이름을 읽었으므로 감춘다. */}
        <span className="sr-only">{label}</span>
        <span
          className={cn('min-w-0 flex-1 truncate', !filled && 'text-gray-400')}
          title={text || undefined}
        >
          {filled ? text : (placeholder ?? '선택')}
        </span>
        {trailing}
      </button>
      {/* 값 위에 얹히는 표식이라 칸의 흐름에서 빼고(절대배치), 누르는 일은 칸 전체가 받는다. */}
      <span
        className={cn(
          'pointer-events-none absolute shrink-0',
          disabled ? 'text-gray-300' : 'text-gray-400',
          pad.iconRight,
        )}
        aria-hidden="true"
      >
        <SearchGlyph size={glyph} />
      </span>
    </div>
  )
}
