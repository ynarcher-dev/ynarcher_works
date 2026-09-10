import { IconButton } from '@ynarcher/ui'
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Plus, Trash2 } from 'lucide-react'
import { canIndent, canMove } from '@/features/approval/budgetEdit'
import type { BudgetRow } from '@/features/approval/budget'

interface Props {
  rows: BudgetRow[]
  index: number
  onAddSibling: () => void
  onOutdent: () => void
  onIndent: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  onRemove: () => void
}

/**
 * 예산표 한 줄의 조작 — `+ ← → ↑ ↓ 🗑`.
 *
 * 새 줄은 **같은 층에** 선다. 아래층 줄을 따로 두지 않는 이유는 `+` 다음 `→` 두 번이면
 * 되기 때문이고, 버튼이 하나 늘면 여섯이 일곱이 되어 줄 끝이 조작으로 가득 찬다.
 *
 * 모든 조작은 그 줄에 딸린 아래 줄까지 함께 움직인다(budgetEdit) — 부모만 따로 움직이면
 * 자식이 남의 부모 밑으로 들어가는데, 화면에서는 들여쓰기만 슬쩍 바뀌어 보인다.
 */
export function BudgetRowActions({
  rows,
  index,
  onAddSibling,
  onOutdent,
  onIndent,
  onMoveUp,
  onMoveDown,
  onRemove,
}: Props) {
  return (
    <div className="flex items-center justify-end gap-0.5">
      <IconButton
        density="table"
        variant="ghost"
        label="같은 층에 줄 추가"
        onClick={onAddSibling}
        icon={<Plus size={14} />}
      />
      <IconButton
        density="table"
        variant="ghost"
        label="한 층 내리기"
        onClick={onOutdent}
        disabled={(rows[index]?.depth ?? 0) === 0}
        icon={<ChevronLeft size={14} />}
      />
      <IconButton
        density="table"
        variant="ghost"
        label="한 층 들이기"
        onClick={onIndent}
        disabled={!canIndent(rows, index)}
        icon={<ChevronRight size={14} />}
      />
      <IconButton
        density="table"
        variant="ghost"
        label="위로"
        onClick={onMoveUp}
        disabled={!canMove(rows, index, -1)}
        icon={<ArrowUp size={14} />}
      />
      <IconButton
        density="table"
        variant="ghost"
        label="아래로"
        onClick={onMoveDown}
        disabled={!canMove(rows, index, 1)}
        icon={<ArrowDown size={14} />}
      />
      <IconButton
        density="table"
        variant="ghost"
        danger
        label="줄 삭제(아래 줄 포함)"
        onClick={onRemove}
        // 마지막 한 줄은 남긴다 — 표가 통째로 사라지면 무엇을 적는 자리였는지 알 수 없다.
        disabled={rows.length <= 1}
        icon={<Trash2 size={14} />}
      />
    </div>
  )
}
