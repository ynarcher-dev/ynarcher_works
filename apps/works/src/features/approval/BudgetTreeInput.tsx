import { Button, Input, Select, HierarchyTable, HierarchyLevelFields, HierarchyNameInput, cn, tableText } from '@ynarcher/ui'
import { Plus } from 'lucide-react'
import { BudgetRowActions } from '@/features/approval/BudgetRowActions'
import {
  asBudgetTree,
  budgetEntries,
  budgetGridGroups,
  budgetTotal,
  levelLabel,
  type BudgetTreeValue,
} from '@/features/approval/budget'
import {
  addBudgetSiblingBranch,
  appendBudgetEntry,
  canMoveBudgetEntry,
  moveBudgetEntry,
  removeBudgetEntry,
  setBudgetCellWithVat,
  setLevel,
  setLevelCount,
  setName,
} from '@/features/approval/budgetEdit'
import {
  amountKeys,
  budgetAmountColumn,
  budgetAmountFormula,
  hasVatColumns,
  isNumericColumn,
  type FormColumn,
  type FormField,
} from '@/features/approval/fields'
import { formatMoney, toNumber } from '@/features/approval/numeric'
import {
  VAT_KINDS,
  VAT_KIND_LABEL,
  readAmounts,
  validateAmounts,
} from '@/features/approval/vat'

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
  const formula = budgetAmountFormula(field)
  const amountColumnIndex = amountColumn
    ? columns.findIndex((column) => column.key === amountColumn.key)
    : -1
  const summaryColumnIndex = amountColumnIndex >= 0 ? amountColumnIndex : columns.length
  const keys = amountKeys(field)
  const tree = asBudgetTree(value)
  const groups = budgetGridGroups(tree)
  const gridRows = groups.flatMap((group) => group.rows)
  const entries = budgetEntries(tree)
  const rows = gridRows.map((gridRow) => gridRow.row)
  const levelCount = Math.max(1, value.levels.length)
  const levels = value.levels.length > 0 ? value.levels : ['1단계']

  // 맨 아래 줄만 본다 — 위층 값은 합으로 파생하므로 스스로 어긋날 수 없다.
  const issues =
    !keys || !hasVatColumns(field)
      ? []
      : entries
        .map((row) => {
          const amounts = readAmounts(row.values, keys)
          const message = validateAmounts(amounts, amounts.kind, true)
          return message ? `${row.name || '이름 없는 항목'}: ${message}` : null
        })
        .filter((m): m is string => m !== null)

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
      <HierarchyLevelFields
        levels={levels}
        onCountChange={changeLevelCount}
        onNameChange={(level, name) => onChange(setLevel(tree, level, name))}
      />
      <HierarchyTable
        caption={field.label}
        levels={levels}
        groups={groups}
        columns={columns.map((column) => ({
          key: column.key,
          label: column.label,
          className: isNumericColumn(column.type) ? 'w-32 text-right' : column.wide ? 'w-48' : 'w-28',
        }))}
        emptyContent={
          <Button variant="ghost" density="table" onClick={() => onChange(appendBudgetEntry(tree))}>
            <Plus size={14} />{levelLabel(levels, 0)} 추가
          </Button>
        }
        renderHierarchyCell={(cell, level) => (
          <HierarchyNameInput
            levelLabel={levelLabel(levels, level)}
            value={tree.rows[cell.nodeIndex]?.name ?? ''}
            onAdd={() => onChange(addBudgetSiblingBranch(tree, cell.nodeIndex))}
            onChange={(e) => onChange(setName(tree, cell.nodeIndex, e.target.value))}
          />
        )}
        renderCells={(gridRow) => (
          <>
            {columns.map((column) => {
              const setCell = (next: string) =>
                onChange(
                  setBudgetCellWithVat(
                    tree,
                    gridRow.leafIndex,
                    column.key,
                    next,
                    formula,
                    keys,
                  ),
                )
              return (
                <td key={column.key} className="px-2 py-1">
                  {column.type === 'VAT_KIND' ? (
                    <Select
                      density="table"
                      aria-label={column.label}
                      value={gridRow.row.values[column.key] ?? ''}
                      onChange={(e) => setCell(e.target.value)}
                    >
                      <option value="">선택</option>
                      {VAT_KINDS.map((k) => (
                        <option key={k} value={k}>
                          {VAT_KIND_LABEL[k]}
                        </option>
                      ))}
                    </Select>
                  ) : (
                    <Input
                      density="table"
                      type={column.type === 'DATE' ? 'date' : 'text'}
                      inputMode={isNumericColumn(column.type) ? 'numeric' : undefined}
                      placeholder={
                        formula?.amountKey === column.key ? '수량 × 단가' : undefined
                      }
                      className={cn(
                        isNumericColumn(column.type) && 'text-right tabular-nums',
                      )}
                      value={gridRow.row.values[column.key] ?? ''}
                      onChange={(e) => setCell(e.target.value)}
                    />
                  )}
                </td>
              )
            })}

          </>
        )}
        renderActions={(_, index) => (
          <BudgetRowActions
            rows={rows}
            canMoveUp={canMoveBudgetEntry(tree, index, -1)}
            canMoveDown={canMoveBudgetEntry(tree, index, 1)}
            onMoveUp={() => onChange(moveBudgetEntry(tree, index, -1))}
            onMoveDown={() => onChange(moveBudgetEntry(tree, index, 1))}
            onRemove={() => onChange(removeBudgetEntry(tree, index))}
          />
        )}
        renderGroupFooter={(group) => {
          const groupRows = group.rows.map((row) => row.row)
          return (
            // 집계 줄의 색은 **읽는 화면과 같다**(BudgetTreeView) — 소계는 옅은 면, 합계는 한
            // 단계 진한 면. 쓸 때만 회색이면 같은 표가 상신 전후로 다른 표처럼 보이고, 입력칸이
            // 늘어선 화면에서는 회색 면이 칸의 테두리와 톤이 겹쳐 묶음 경계가 눈에 걸리지 않는다.
            <tr className="border-b border-summary-blue-icon bg-summary-blue-surface">
              {levels.slice(0, levelCount).map((_, level) => {
                return (
                  <td key={level} className="px-2 py-1">
                    <div className="flex items-center">
                      {level === levelCount - 1 && summaryColumnIndex === 0 && (
                        <span className={cn(tableText.meta, 'ml-auto font-normal text-gray-500')}>
                          소계
                        </span>
                      )}
                    </div>
                  </td>
                )
              })}
              {summaryColumnIndex > 0 && (
                <td
                  colSpan={summaryColumnIndex}
                  className={cn(
                    tableText.meta,
                    'px-2 py-1.5 text-right font-normal text-gray-500',
                  )}
                >
                  소계
                </td>
              )}
              {columns.slice(summaryColumnIndex).map((column) => (
                <td
                  key={column.key}
                  className={cn(
                    tableText.meta,
                    'px-2 py-1.5 font-normal text-gray-500',
                    isNumericColumn(column.type) && 'text-right tabular-nums',
                  )}
                >
                  {amountColumn?.key === column.key
                    ? numericText(
                      column,
                      String(budgetTotal(groupRows, column.key) ?? ''),
                    )
                    : ''}
                </td>
              ))}
              <td />
            </tr>
          )
        }}
        footer={
          // 글자색은 줄이 통째로 갖는다 — 칸마다 회색을 다시 적으면 그 회색이 줄의 색을 덮는다.
          <tr className="border-t border-summary-blue-icon bg-summary-blue-icon text-summary-blue-value">
            {levels.slice(0, levelCount).map((_, level) => (
              <td key={level} className={cn('px-2 py-1.5', tableText.body)}>
                {level === levelCount - 1 && summaryColumnIndex === 0 ? '합계' : ''}
              </td>
            ))}
            {summaryColumnIndex > 0 && (
              <td
                colSpan={summaryColumnIndex}
                className={cn('px-2 py-1.5 text-right', tableText.head)}
              >
                합계
              </td>
            )}
            {columns.slice(summaryColumnIndex).map((column) => (
              <td
                key={column.key}
                className={cn(
                  'px-2 py-1.5',
                  tableText.body,
                  isNumericColumn(column.type) && 'text-right font-semibold tabular-nums',
                )}
              >
                {amountColumn?.key === column.key
                  ? numericText(column, String(budgetTotal(tree.rows, column.key) ?? ''))
                  : ''}
              </td>
            ))}
            <td />
          </tr>
        }
      />

      {issues.length > 0 && (
        <ul className={cn(tableText.body, 'text-danger')}>
          {issues.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      )}

      {!amountColumn && (
        <p className={tableText.empty}>
          이 예산표에 금액 열이 없습니다. ADMIN 결재 양식 관리에서 금액 열을 지정하세요.
        </p>
      )}
    </div>
  )
}
