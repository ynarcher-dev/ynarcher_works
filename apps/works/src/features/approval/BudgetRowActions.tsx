import { IconButton } from '@ynarcher/ui'
import { ArrowDown, ArrowUp, Trash2 } from 'lucide-react'
import type { BudgetRow } from '@/features/approval/budget'

interface Props {
  rows: BudgetRow[]
  canMoveUp: boolean
  canMoveDown: boolean
  onMoveUp: () => void
  onMoveDown: () => void
  onRemove: () => void
}

/**
 * 예산표 한 줄의 조작 — 순서 변경과 삭제만 둔다. 항목 추가는 표 아래의 단일 버튼이 맡는다.
 */
export function BudgetRowActions({
  rows,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
  onRemove,
}: Props) {
  return (
    <div className="flex items-center justify-end gap-0.5">
      <IconButton
        density="table"
        variant="ghost"
        label="위로"
        onClick={onMoveUp}
        disabled={!canMoveUp}
        icon={<ArrowUp size={14} />}
      />
      <IconButton
        density="table"
        variant="ghost"
        label="아래로"
        onClick={onMoveDown}
        disabled={!canMoveDown}
        icon={<ArrowDown size={14} />}
      />
      <IconButton
        density="table"
        variant="ghost"
        danger
        label="줄 삭제"
        onClick={onRemove}
        // 마지막 한 줄은 남긴다 — 표가 통째로 사라지면 무엇을 적는 자리였는지 알 수 없다.
        disabled={rows.length <= 1}
        icon={<Trash2 size={14} />}
      />
    </div>
  )
}
