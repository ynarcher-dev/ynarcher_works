import { Card, cn, formText } from '@ynarcher/ui'
import type { ReactNode } from 'react'
import { expenseSectionTitle } from '@/features/approval/expenseSections'
import type { FormField } from '@/features/approval/fields'

interface ExpenseSectionCardProps {
  /** 이 카드가 통째로 받는 양식 필드(지출 내역·송금 요청 표). */
  field: FormField
  children: ReactNode
}

/**
 * 표 하나가 통째로 든 카드 — **카드 제목이 그 필드의 라벨을 대신한다.**
 *
 * 그래서 안쪽에 `Field`를 한 번 더 두지 않는다. 두면 같은 이름이 카드 제목과 라벨로 두 번 서고,
 * 그 둘은 크기·색이 다른 규격이라 한 상자 안에 제목이 두 개 있는 것처럼 보인다. 예산표 카드가
 * 이미 같은 규약이며(`Card title={budget.label}` + `BudgetTreeInput`), 읽기 전용 쪽의
 * `hideSectionLabels`도 같은 말을 한다.
 *
 * 라벨이 카드 제목으로 옮겨 가면 `Field`가 들고 있던 두 가지가 따라와야 한다.
 * · **필수 표식**: 제목 뒤에 같은 토큰(`formText.required`)으로 붙는다. 표식이 사라지면
 *   "적어야 하는 표"와 "적어도 되는 표"가 화면에서 같아 보인다.
 * · **도움말**: 카드 제목 옆 말풍선(`help`)이 받는다 — `Field`의 `hint`가 서던 자리와 같은
 *   단계(캡션)이고, 규격의 소유자만 `Field`에서 `CardHeading`으로 바뀐다.
 */
export function ExpenseSectionCard({ field, children }: ExpenseSectionCardProps) {
  return (
    <Card
      title={
        <>
          {expenseSectionTitle(field)}
          {field.required && <span className={cn('ml-0.5', formText.required)}>*</span>}
        </>
      }
      help={field.help}
    >
      {children}
    </Card>
  )
}
