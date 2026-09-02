import type { ReactNode } from 'react'
import { cn } from '../utils/cn'
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
  as: Comp = 'label',
  className,
  children,
}: FieldProps) {
  // 펼 도움말과 접을 도움말을 먼저 가른다. 오류가 있으면 도움말은 접힌 채로 둔다 —
  // 컨트롤 아래 한 줄을 오류와 도움말이 다투면 정작 고쳐야 할 말이 밀린다.
  const inlineHint = hintInline && !error ? hint : undefined
  const tipHint = hintInline ? undefined : hint
  return (
    <Comp className={cn('block', className)}>
      <span className={cn('mb-1 block', formText.label)}>
        {label}
        {required && <span className={cn('ml-0.5', formText.required)}>*</span>}
        {tipHint && (
          <Tooltip
            content={tipHint}
            label={typeof label === 'string' ? label : undefined}
            className={tooltipScale.gap}
          />
        )}
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
