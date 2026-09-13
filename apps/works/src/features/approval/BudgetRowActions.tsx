import { HierarchyRowActions } from '@ynarcher/ui'
import type { BudgetRow } from '@/features/approval/budget'

interface Props {
  rows: BudgetRow[]
  canMoveUp: boolean
  canMoveDown: boolean
  onMoveUp: () => void
  onMoveDown: () => void
  onRemove: () => void
}

/** 예산표는 마지막 한 줄을 유지한다. 조작 UI는 공용 계층 표와 공유한다. */
export function BudgetRowActions({ rows, ...actions }: Props) {
  return <HierarchyRowActions {...actions} canRemove={rows.length > 1} />
}
