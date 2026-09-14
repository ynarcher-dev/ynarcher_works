import { HierarchyTable, cn, tableText } from '@ynarcher/ui'
import {
  asBudgetTree,
  budgetGridGroups,
  budgetTotal,
  type BudgetTreeValue,
} from '@/features/approval/budget'
import {
  budgetAmountColumn,
  isNumericColumn,
  type FormColumn,
  type FormField,
} from '@/features/approval/fields'
import { formatMoney, toNumber } from '@/features/approval/numeric'
import { vatKindLabel } from '@/features/approval/vat'

/** 한 예산 줄에서 지금까지 나간 돈. 서버(approval_budget_status)가 답한다. */
export interface BudgetUsage {
  spent: number
  pending: number
}

interface Props {
  field: FormField
  value: BudgetTreeValue
  usage?: Map<string, BudgetUsage>
  /**
   * 카드 안처럼 폭이 모자란 자리에서 **글 칸을 접는다**(산출내역/비고 같은 자유기입 열).
   *
   * 숫자 열은 폭이 정해져 있지만 글 열은 얼마든 길어져, 열 자리를 내주고 나면 정작 금액·사용·
   * 남음이 화면 밖으로 밀린다. 접힌 글 칸은 두 줄로 잘려 어차피 다 읽히지도 않았다 — 그래서
   * 여기서는 아예 세우지 않고, 전부 읽는 일은 확대보기가 맡는다(compact 없이 부르면 다 선다).
   */
  compact?: boolean
}

function numericText(column: FormColumn, raw: string): string {
  const n = toNumber(raw)
  if (n === null) return raw || '-'
  return column.type === 'MONEY' ? formatMoney(n) : n.toLocaleString('ko-KR')
}

/** 예산표 읽기. 입력 화면과 같은 가로형 분류 열을 유지해 경로를 다시 해석하지 않게 한다. */
export function BudgetTreeView({ field, value, usage, compact = false }: Props) {
  const allColumns = field.columns ?? []
  // 접는 대상은 자유기입(TEXT) 열뿐이다 — 날짜·선택·과세 유형은 폭이 예측되고, 숫자 열은
  // 이 표가 답해야 할 물음 그 자체라 어느 폭에서도 선다.
  const columns = compact ? allColumns.filter((column) => column.type !== 'TEXT') : allColumns
  const tree = asBudgetTree(value)
  const groups = budgetGridGroups(tree)
  const rows = groups.flatMap((group) => group.rows)
  const levels = value.levels.length > 0 ? value.levels : ['1단계']
  const amountColumn = budgetAmountColumn(field)
  const amountColumnIndex = amountColumn
    ? columns.findIndex((column) => column.key === amountColumn.key)
    : -1
  const summaryColumnIndex = amountColumnIndex >= 0 ? amountColumnIndex : columns.length

  if (rows.length === 0) {
    return <p className={cn('py-2', tableText.empty)}>작성된 예산이 없습니다.</p>
  }

  const totalBudget = amountColumn ? budgetTotal(tree.rows, amountColumn.key) : null
  const totalUsage = usage
    ? rows.reduce(
      (acc, gridRow) => {
        const current = usage.get(gridRow.row.id)
        return {
          spent: acc.spent + (current?.spent ?? 0),
          pending: acc.pending + (current?.pending ?? 0),
        }
      },
      { spent: 0, pending: 0 },
    )
    : null

  return (
    <HierarchyTable
      mode="view"
      caption={field.label}
      levels={levels}
      groups={groups}
      columns={[
        ...columns.map((column) => ({ key: column.key, label: column.label, className: isNumericColumn(column.type) ? 'w-32 text-right' : undefined })),
        ...(usage ? [
          { key: 'usage:spent', label: '사용금액', className: 'w-32 text-right' },
          { key: 'usage:pending', label: '결재 대기', className: 'w-32 text-right' },
          { key: 'usage:remaining', label: '잔액', className: 'w-32 text-right' },
          { key: 'usage:available', label: '사용가능', className: 'w-32 text-right' },
        ] : []),
      ]}
      renderHierarchyCell={(cell) => (
        <div className="line-clamp-2 min-w-[8rem] max-w-[14rem] break-all" title={tree.rows[cell.nodeIndex]?.name || undefined}>
          {tree.rows[cell.nodeIndex]?.name || '-'}
        </div>
      )}
      renderCells={(gridRow) => {
        const current =
          usage?.get(gridRow.row.id) ?? (usage ? { spent: 0, pending: 0 } : null)
        const budget = amountColumn
          ? toNumber(gridRow.row.values[amountColumn.key] ?? '')
          : null
        const remaining = current && budget !== null ? budget - current.spent : null
        const available =
          current && budget !== null
            ? budget - current.spent - current.pending
            : null

        return <>
          {columns.map((column) => (
            <td
              key={column.key}
              className={cn(
                'px-3 py-1.5',
                tableText.body,
                isNumericColumn(column.type) && 'text-right tabular-nums',
              )}
            >
              {isNumericColumn(column.type)
                ? numericText(column, gridRow.row.values[column.key] ?? '')
                : column.type === 'VAT_KIND'
                  ? (vatKindLabel(gridRow.row.values[column.key]) ?? '-')
                  : gridRow.row.values[column.key] || '-'}
            </td>
          ))}
          {usage && current && (
            <>
              <td
                className={cn(
                  'px-3 py-1.5 text-right tabular-nums',
                  tableText.body,
                )}
              >
                {current.spent ? formatMoney(current.spent) : '-'}
              </td>
              <td
                className={cn(
                  'px-3 py-1.5 text-right tabular-nums text-gray-500',
                  tableText.body,
                )}
              >
                {current.pending ? formatMoney(current.pending) : '-'}
              </td>
              <td
                className={cn(
                  'px-3 py-1.5 text-right font-medium tabular-nums',
                  tableText.body,
                  remaining !== null && remaining < 0 && 'text-danger',
                )}
              >
                {remaining === null ? '-' : formatMoney(remaining)}
              </td>
              <td
                className={cn(
                  'px-3 py-1.5 text-right tabular-nums',
                  tableText.body,
                  available !== null && available < 0 && 'text-danger',
                )}
              >
                {available === null ? '-' : formatMoney(available)}
              </td>
            </>
          )}

        </>
      }}
      renderGroupFooter={(group) => {
        const groupRows = group.rows.map((row) => row.row)
        const groupBudget = amountColumn
          ? budgetTotal(groupRows, amountColumn.key)
          : null
        const groupUsage = usage
          ? group.rows.reduce(
            (acc, gridRow) => {
              const current = usage.get(gridRow.row.id)
              return {
                spent: acc.spent + (current?.spent ?? 0),
                pending: acc.pending + (current?.pending ?? 0),
              }
            },
            { spent: 0, pending: 0 },
          )
          : null

        return (
          // 집계 줄은 **같은 계열의 두 단계**로 세운다(소계는 옅은 면, 합계는 한 단계 진한 면).
          // 회색 하나로는 표 머리글·본문과 톤이 겹쳐 어디서 묶였는지가 눈에 걸리지 않았다.
          // 파랑 계열을 고른 이유는 이 표의 유일한 색 신호가 초과(danger)의 빨강이기 때문이다 —
          // 노란 계열(재무 범주)을 깔면 그 경고와 한 화면에서 섞여 읽힌다.
          <tr className="border-b border-summary-blue-icon bg-summary-blue-surface">
            <td
              colSpan={levels.length}
              className={cn(
                tableText.meta,
                'px-3 py-1.5 text-right font-normal text-gray-500',
              )}
            >
              {summaryColumnIndex === 0 ? '소계' : ''}
            </td>
            {summaryColumnIndex > 0 && (
              <td
                colSpan={summaryColumnIndex}
                className={cn(
                  tableText.meta,
                  'px-3 py-1.5 text-right font-normal text-gray-500',
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
                  'px-3 py-1.5 font-normal text-gray-500',
                  isNumericColumn(column.type) && 'text-right tabular-nums',
                )}
              >
                {amountColumn?.key === column.key
                  ? numericText(column, String(budgetTotal(groupRows, column.key) ?? ''))
                  : ''}
              </td>
            ))}
            {usage && groupUsage && (
              <>
                <td
                  className={cn(
                    tableText.meta,
                    'px-3 py-1.5 text-right font-normal tabular-nums text-gray-500',
                  )}
                >
                  {formatMoney(groupUsage.spent)}
                </td>
                <td
                  className={cn(
                    tableText.meta,
                    'px-3 py-1.5 text-right font-normal tabular-nums text-gray-500',
                  )}
                >
                  {formatMoney(groupUsage.pending)}
                </td>
                <td
                  className={cn(
                    tableText.meta,
                    'px-3 py-1.5 text-right font-normal tabular-nums text-gray-500',
                    groupBudget !== null && groupBudget - groupUsage.spent < 0 &&
                    'text-danger',
                  )}
                >
                  {groupBudget === null
                    ? '-'
                    : formatMoney(groupBudget - groupUsage.spent)}
                </td>
                <td
                  className={cn(
                    tableText.meta,
                    'px-3 py-1.5 text-right font-normal tabular-nums text-gray-500',
                    groupBudget !== null &&
                    groupBudget - groupUsage.spent - groupUsage.pending < 0 &&
                    'text-danger',
                  )}
                >
                  {groupBudget === null
                    ? '-'
                    : formatMoney(groupBudget - groupUsage.spent - groupUsage.pending)}
                </td>
              </>
            )}
          </tr>

        )
      }}
      footer={
        <tr className="border-t border-summary-blue-icon bg-summary-blue-icon text-summary-blue-value">
          {levels.map((_, level) => (
            <td key={level} className={cn('px-3 py-1.5', tableText.body)}>
              {level === levels.length - 1 && summaryColumnIndex === 0 ? '합계' : ''}
            </td>
          ))}
          {summaryColumnIndex > 0 && (
            <td
              colSpan={summaryColumnIndex}
              className={cn('px-3 py-1.5 text-right', tableText.head)}
            >
              합계
            </td>
          )}
          {columns.slice(summaryColumnIndex).map((column) => (
            <td
              key={column.key}
              className={cn(
                'px-3 py-1.5',
                tableText.body,
                isNumericColumn(column.type) && 'text-right font-semibold tabular-nums',
              )}
            >
              {amountColumn?.key === column.key
                ? numericText(column, String(budgetTotal(tree.rows, column.key) ?? ''))
                : ''}
            </td>
          ))}
          {usage && totalUsage && (
            <>
              <td className={cn('px-3 py-1.5 text-right font-semibold tabular-nums', tableText.body)}>
                {formatMoney(totalUsage.spent)}
              </td>
              <td className={cn('px-3 py-1.5 text-right tabular-nums text-summary-blue-chip', tableText.body)}>
                {formatMoney(totalUsage.pending)}
              </td>
              <td
                className={cn(
                  'px-3 py-1.5 text-right font-semibold tabular-nums',
                  tableText.body,
                  totalBudget !== null && totalBudget - totalUsage.spent < 0 && 'text-danger',
                )}
              >
                {totalBudget === null ? '-' : formatMoney(totalBudget - totalUsage.spent)}
              </td>
              <td
                className={cn(
                  'px-3 py-1.5 text-right font-semibold tabular-nums',
                  tableText.body,
                  totalBudget !== null &&
                  totalBudget - totalUsage.spent - totalUsage.pending < 0 &&
                  'text-danger',
                )}
              >
                {totalBudget === null
                  ? '-'
                  : formatMoney(totalBudget - totalUsage.spent - totalUsage.pending)}
              </td>
            </>
          )}
        </tr>

      }
    />
  )
}
