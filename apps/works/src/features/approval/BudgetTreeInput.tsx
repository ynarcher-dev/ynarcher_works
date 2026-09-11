import { Button, Input, Select, cn, tableText } from '@ynarcher/ui'
import { Plus } from 'lucide-react'
import { BudgetRowActions } from '@/features/approval/BudgetRowActions'
import {
  asBudgetTree,
  budgetEntries,
  budgetGridRows,
  budgetTotal,
  levelLabel,
  type BudgetTreeValue,
} from '@/features/approval/budget'
import {
  addBudgetBranch,
  appendBudgetEntry,
  canMoveBudgetEntry,
  moveBudgetEntry,
  removeBudgetEntry,
  setCell,
  setLevel,
  setLevelCount,
  setName,
} from '@/features/approval/budgetEdit'
import {
  budgetAmountColumn,
  isNumericColumn,
  type FormColumn,
  type FormField,
} from '@/features/approval/fields'
import { formatMoney, toNumber } from '@/features/approval/numeric'

interface Props {
  field: FormField
  value: BudgetTreeValue
  onChange: (next: BudgetTreeValue) => void
}

/** 숫자 열의 표기 — 금액은 원, 숫자는 천단위. 읽을 수 없는 값은 적힌 그대로 둔다. */
function numericText(column: FormColumn, raw: string): string {
  const n = toNumber(raw)
  if (n === null) return raw || '-'
  return column.type === 'MONEY' ? formatMoney(n) : n.toLocaleString('ko-KR')
}

/**
 * 품의서 예산표 입력. 분류의 단계 수와 이름을 먼저 정하면 각 단계가 독립 열로 서고,
 * 한 행에서 전체 분류 경로와 숫자를 함께 적는다. 트리 들여쓰기와 층 이동 조작은 없다.
 */
export function BudgetTreeInput({ field, value, onChange }: Props) {
  const columns = field.columns ?? []
  const amountColumn = budgetAmountColumn(field)
  const tree = asBudgetTree(value)
  const gridRows = budgetGridRows(tree)
  const entries = budgetEntries(tree)
  const rows = gridRows.map((gridRow) => gridRow.row)
  const levelCount = Math.max(1, value.levels.length)
  const levels = value.levels.length > 0 ? value.levels : ['1단계']
  const levelOptions = Array.from({ length: Math.max(5, levelCount) }, (_, i) => i + 1)

  const changeLevelCount = (next: number) => {
    if (next < levelCount) {
      const losesValues = entries.some((row) =>
        (row.path ?? []).slice(next).some((cell) => cell.trim() !== ''),
      )
      if (
        losesValues &&
        !window.confirm('단계를 줄이면 삭제되는 분류 값이 있습니다. 계속할까요?')
      ) {
        return
      }
    }
    onChange(setLevelCount(tree, next))
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 rounded-radius-md border border-gray-200 bg-gray-25 p-3 sm:grid-cols-[9rem_1fr]">
        <label className="space-y-1">
          <span className={tableText.head}>분류 단계 수</span>
          <Select
            density="table"
            value={String(levelCount)}
            onChange={(e) => changeLevelCount(Number(e.target.value))}
          >
            {levelOptions.map((count) => (
              <option key={count} value={count}>
                {count}단계
              </option>
            ))}
          </Select>
        </label>

        <div className="space-y-1">
          <span className={tableText.head}>단계별 이름</span>
          <div className="overflow-x-auto pb-1">
            <div className="flex min-w-max flex-nowrap items-center gap-2">
              {levels.slice(0, levelCount).map((label, level) => (
                <div key={level} className="w-28 shrink-0">
                  <Input
                    density="table"
                    className="w-full"
                    aria-label={`${level + 1}단계 이름`}
                    placeholder={`${level + 1}단계`}
                    value={label}
                    onChange={(e) => onChange(setLevel(tree, level, e.target.value))}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto rounded-radius-md border border-gray-200">
        <table className="w-full min-w-[56rem] border-collapse">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-25">
              {levels.slice(0, levelCount).map((_, level) => (
                <th key={level} className={cn('w-36 px-2 py-1.5 text-left', tableText.head)}>
                  {levelLabel(levels, level)}
                </th>
              ))}
              {columns.map((column) => (
                <th
                  key={column.key}
                  className={cn(
                    'px-2 py-1.5 text-left',
                    tableText.head,
                    isNumericColumn(column.type)
                      ? 'w-32 text-right'
                      : column.wide
                        ? 'w-48'
                        : 'w-28',
                  )}
                >
                  {column.label}
                </th>
              ))}
              <th className="w-24 px-2 py-1.5 text-center">
                <span className="sr-only">줄 조작</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {gridRows.map((gridRow, index) => (
              <tr key={gridRow.row.id} className="border-b border-gray-100 last:border-b-0">
                {gridRow.cells.map((cell, level) =>
                  cell ? (
                    <td
                      key={level}
                      rowSpan={cell.rowSpan}
                      className="h-px border-r border-gray-100 px-2 py-1 align-middle"
                    >
                      <div className="flex h-full items-stretch">
                        <Input
                          density="table"
                          className="h-full min-h-8"
                          value={tree.rows[cell.nodeIndex]?.name ?? ''}
                          action={
                            level < levelCount - 1 ? <Plus aria-hidden size={14} /> : undefined
                          }
                          actionLabel={
                            level < levelCount - 1
                              ? `${levelLabel(levels, level + 1)} 분기 추가`
                              : undefined
                          }
                          onActionClick={
                            level < levelCount - 1
                              ? () => onChange(addBudgetBranch(tree, cell.nodeIndex))
                              : undefined
                          }
                          onChange={(e) =>
                            onChange(setName(tree, cell.nodeIndex, e.target.value))
                          }
                        />
                      </div>
                    </td>
                  ) : null,
                )}

                {columns.map((column) => (
                  <td key={column.key} className="px-2 py-1">
                    <Input
                      density="table"
                      type={column.type === 'DATE' ? 'date' : 'text'}
                      inputMode={isNumericColumn(column.type) ? 'numeric' : undefined}
                      className={cn(isNumericColumn(column.type) && 'text-right tabular-nums')}
                      value={gridRow.row.values[column.key] ?? ''}
                      onChange={(e) =>
                        onChange(setCell(tree, gridRow.leafIndex, column.key, e.target.value))
                      }
                    />
                  </td>
                ))}

                <td className="px-2 py-1">
                  <BudgetRowActions
                    rows={rows}
                    canMoveUp={canMoveBudgetEntry(tree, index, -1)}
                    canMoveDown={canMoveBudgetEntry(tree, index, 1)}
                    onMoveUp={() => onChange(moveBudgetEntry(tree, index, -1))}
                    onMoveDown={() => onChange(moveBudgetEntry(tree, index, 1))}
                    onRemove={() => onChange(removeBudgetEntry(tree, index))}
                  />
                </td>
              </tr>
            ))}

            <tr className="border-t border-gray-200 bg-gray-25">
              {levels.slice(0, levelCount).map((_, level) => (
                <td
                  key={level}
                  className={cn('px-2 py-1.5 text-gray-600', tableText.body)}
                >
                  {level === 0 ? '합계' : ''}
                </td>
              ))}
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={cn(
                    'px-2 py-1.5',
                    tableText.body,
                    isNumericColumn(column.type) && 'text-right font-semibold tabular-nums',
                  )}
                >
                  {isNumericColumn(column.type)
                    ? numericText(column, String(budgetTotal(tree.rows, column.key) ?? ''))
                    : ''}
                </td>
              ))}
              <td />
            </tr>
          </tbody>
        </table>

        <div className="border-t border-gray-100 p-2">
          <Button variant="ghost" density="table" onClick={() => onChange(appendBudgetEntry(tree))}>
            <Plus size={14} className="mr-1" />
            {levelLabel(levels, 0)} 추가
          </Button>
        </div>
      </div>

      {!amountColumn && (
        <p className={tableText.empty}>
          이 예산표에 금액 열이 없습니다. ADMIN 결재 양식 관리에서 금액 열을 지정하세요.
        </p>
      )}
    </div>
  )
}
