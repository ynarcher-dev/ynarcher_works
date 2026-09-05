import type { ReactNode } from 'react'
import { cn } from '../utils/cn'
import { DensityProvider } from '../density'
import { formText, tooltipScale } from '../densityScale'
import { Tooltip } from './Tooltip'

export interface FieldProps {
  /** 입력 위 라벨. */
  label: ReactNode
  /** 필수 표식(`*`)을 라벨 뒤에 붙인다. */
  required?: boolean
  /**
   * 이 칸의 규칙·의미 설명. 기본은 **라벨 옆 도움말(ⓘ) 말풍선**이다.
   *
   * 상시 노출하던 캡션 한 줄을 대체한다(2026-09-01). 이유는 `tooltipScale` 주석 참조 — 요약하면
   * 규칙은 그 칸을 채우려는 사람만 필요로 한다.
   */
  hint?: ReactNode
  /**
   * 도움말을 접지 않고 컨트롤 아래 캡션으로 편다.
   *
   * **다음 행동을 지시하는 안내에만 쓴다** — 왜 못 채우는지, 무엇을 먼저 해야 하는지. 호버해야
   * 보이는 문구는 막힌 이유의 답이 될 수 없다. 단순한 규칙 설명에 이 스위치를 켜면 접기로 정한
   * 기준이 화면마다 갈린다.
   */
  hintInline?: boolean
  /**
   * 검증 실패 안내. 지정하면 접지 않고 컨트롤 아래에 편다 — 오류는 물어봐야 답하는 것이 아니라
   * 먼저 말해야 하는 것이다.
   */
  error?: ReactNode
  /**
   * 라벨 줄 오른쪽 끝에 세울 것 — **그 칸의 값에 붙는 성질**을 켜고 끄는 작은 컨트롤(체크 하나)
   * 자리다. 값이 아니라 값의 성질이라 칸을 늘리지 않으며, 컨트롤 아래에 붙이면 '입력 다음 입력'
   * 으로 읽히는 세로 흐름을 끊어 어느 칸에 붙은 성질인지가 흐려진다.
   *
   * 규격은 화면이 아니라 이 컴포넌트가 갖는다 — 이 자리는 표 밀도(캡션 12px)로 고정한다. 라벨과
   * 같은 크기로 세우지 않는 것은, 이것이 두 번째 라벨이 아니라 **그 칸에 달린 주석**이기 때문이다.
   * 도움말 말풍선이 같은 캡션 단계에 사는 것과 같은 이유이며, 같은 크기로 서면 라벨과 이 문구 중
   * 무엇이 이 칸의 이름인지가 한눈에 갈리지 않는다.
   *
   * 이 슬롯을 쓰면 바깥 태그가 `div`로 내려간다 — `<label>` 안에 또 `<label>`을 둘 수 없고, 두면
   * 체크를 눌러도 초점이 옆 입력칸으로 간다.
   */
  labelAside?: ReactNode
  /**
   * 렌더할 태그. 기본 `label`은 라벨을 눌러도 컨트롤에 초점이 가지만, 안에 컨트롤이 둘 이상
   * 들어가면(시작·종료 시각 등) 어느 것을 가리키는지 모호해지므로 `div`로 바꾼다.
   */
  as?: 'label' | 'div'
  className?: string
  children: ReactNode
}

/**
 * 폼 필드 한 칸 — 라벨 + 컨트롤 + 도움말/오류의 공용 규격.
 *
 * 카드의 라벨:값을 `InfoField`가 소유하듯, 폼의 라벨을 이 컴포넌트가 소유한다. 규격을 화면에서
 * 직접 쓰지 않는 이유는 같다 — 소유자가 없던 동안 works 전체에 라벨 규격 네 가지가 생겼고, 한
 * 모달 안에서도 필드마다 라벨 크기가 달랐다. 값은 `formText`(densityScale.ts)가 갖는다.
 *
 * 도움말이 서는 자리도 이 컴포넌트가 소유한다. `hint`를 넘긴 28곳은 화면 코드를 한 줄도 고치지
 * 않고 말풍선으로 함께 옮겨졌다 — 접기/펴기를 화면마다 다시 정하지 않게 하려면 판단이 아니라
 * 자리가 한곳에 있어야 한다.
 *
 * 컨트롤 자체(`Input`·`Select`·`TextArea`)는 자식으로 받는다 — 이 컴포넌트는 라벨 층만 책임지고
 * 밀도 맥락은 부모 카드·모달이 이미 내려주고 있다.
 */
export function Field({
  label,
  required,
  hint,
  hintInline,
  error,
  labelAside,
  as = 'label',
  className,
  children,
}: FieldProps) {
  // 펼 도움말과 접을 도움말을 먼저 가른다. 오류가 있으면 도움말은 접힌 채로 둔다 —
  // 컨트롤 아래 한 줄을 오류와 도움말이 다투면 정작 고쳐야 할 말이 밀린다.
  const inlineHint = hintInline && !error ? hint : undefined
  const tipHint = hintInline ? undefined : hint
  // 라벨 줄에 컨트롤이 서면 바깥은 label일 수 없다(중첩 label 금지).
  const Comp = labelAside ? 'div' : as
  const labelText = (
    <>
      {label}
      {required && <span className={cn('ml-0.5', formText.required)}>*</span>}
      {tipHint && (
        <Tooltip
          content={tipHint}
          label={typeof label === 'string' ? label : undefined}
          className={tooltipScale.gap}
        />
      )}
    </>
  )
  return (
    <Comp className={cn('block', className)}>
      <span
        className={cn(
          'mb-1',
          labelAside ? 'flex items-center justify-between gap-2' : 'block',
          formText.label,
        )}
      >
        {labelAside ? <span>{labelText}</span> : labelText}
        {labelAside && <DensityProvider value="table">{labelAside}</DensityProvider>}
      </span>
      {children}
      {error ? (
        <span className={cn('mt-1 block', formText.error)}>{error}</span>
      ) : (
        inlineHint && <span className={cn('mt-1 block', formText.hint)}>{inlineHint}</span>
      )}
    </Comp>
  )
}
