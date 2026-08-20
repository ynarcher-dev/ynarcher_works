import type { ReactNode } from 'react'
import { cn } from '../utils/cn'
import { formText } from '../densityScale'

export interface FieldProps {
  /** 입력 위 라벨. */
  label: ReactNode
  /** 필수 표식(`*`)을 라벨 뒤에 붙인다. */
  required?: boolean
  /** 컨트롤 아래 도움말 한 줄. */
  hint?: ReactNode
  /** 검증 실패 안내. 지정하면 `hint` 대신 이 줄을 보여준다(같은 자리를 두 줄이 다투지 않게). */
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
 * 컨트롤 자체(`Input`·`Select`·`TextArea`)는 자식으로 받는다 — 이 컴포넌트는 라벨 층만 책임지고
 * 밀도 맥락은 부모 카드·모달이 이미 내려주고 있다.
 */
export function Field({
  label,
  required,
  hint,
  error,
  as: Comp = 'label',
  className,
  children,
}: FieldProps) {
  return (
    <Comp className={cn('block', className)}>
      <span className={cn('mb-1 block', formText.label)}>
        {label}
        {required && <span className={cn('ml-0.5', formText.required)}>*</span>}
      </span>
      {children}
      {error ? (
        <span className={cn('mt-1 block', formText.error)}>{error}</span>
      ) : (
        hint && <span className={cn('mt-1 block', formText.hint)}>{hint}</span>
      )}
    </Comp>
  )
}
