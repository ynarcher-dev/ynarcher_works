import { Fragment } from 'react'
import { cn, tableText } from '@ynarcher/ui'
import {
  asBudgetTree,
  budgetGridGroups,
  budgetTotal,
  levelLabel,
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
}

function numericText(column: FormColumn, raw: string): string {
  const n = toNumber(raw)
  if (n === null) return raw || '-'
  return column.type === 'MONEY' ? formatMoney(n) : n.toLocaleString('ko-KR')
}

/** 예산표 읽기. 입력 화면과 같은 가로형 분류 열을 유지해 경로를 다시 해석하지 않게 한다. */
export function BudgetTreeView({ field, value, usage }: Props) {
  const columns = field.columns ?? []
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
    // relative가 없으면 스크롤 상자가 자기 폭을 부모에 맞추지 못해 문서 전체가 가로로 밀린다.
    <div className="relative min-w-0 max-w-full overflow-x-auto rounded-radius-md border border-gray-200">
      <table className="w-full min-w-[48rem] border-collapse">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-25">
            {levels.map((_, level) => (
              <th key={level} className={cn('w-36 px-3 py-1.5 text-left', tableText.head)}>
                {levelLabel(levels, level)}
              </th>
            ))}
            {columns.map((column) => (
              <th
                key={column.key}
                className={cn(
                  'px-3 py-1.5 text-left',
                  tableText.head,
                  isNumericColumn(column.type) && 'w-32 text-right',
                )}
              >
                {column.label}
              </th>
            ))}
            {usage && (
              <>
                <th className={cn('w-32 px-3 py-1.5 text-right', tableText.head)}>사용</th>
                <th className={cn('w-32 px-3 py-1.5 text-right', tableText.head)}>결재 중</th>
                <th className={cn('w-32 px-3 py-1.5 text-right', tableText.head)}>남음</th>
                {/* 남음(예산−사용)과 사용 가능(예산−사용−결재 중)은 다른 값이다. 앞의 것은
                    지금까지의 이익, 뒤의 것은 **지금 더 올릴 수 있는 돈**이다. */}
                <th className={cn('w-32 px-3 py-1.5 text-right', tableText.head)}>사용 가능</th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {groups.map((group) => {
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
              <Fragment key={tree.rows[group.rootIndex]?.id ?? group.rootIndex}>
                {group.rows.map((gridRow) => {
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
                  return (
                    <tr key={gridRow.row.id} className="border-b border-gray-100">
                      {gridRow.cells.map((cell, level) =>
                        cell ? (
                          <td
                            key={level}
                            rowSpan={cell.rowSpan}
                            className={cn(
                              'border-r border-gray-100 px-3 py-1.5 align-middle',
                              tableText.body,
                            )}
                          >
                            {/* 항목 이름은 칸 안에서 접는다 — 본문이 word-break:keep-all이라
                                긴 이름 하나가 표 전체를 늘린다(한 항목으로 2980px까지 늘었다).
                                다만 `break-all`만 두면 반대로 칸이 두 글자까지 찌그러져 한 줄이
                                1500px 높이가 된다. 최소 폭으로 칸을 버티게 하고 두 줄에서
                                끊으며, 잘린 전체 이름은 title로 준다. */}
                            <div
                              className="line-clamp-2 min-w-[8rem] max-w-[14rem] break-all"
                              title={tree.rows[cell.nodeIndex]?.name || undefined}
                            >
                              {tree.rows[cell.nodeIndex]?.name || '-'}
                            </div>
                          </td>
                        ) : null,
                      )}
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
                    </tr>
                  )
                })}

                <tr className="border-b border-gray-200 bg-gray-25">
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
              </Fragment>
            )
          })}

          <tr className="border-t border-gray-200 bg-gray-25">
            {levels.map((_, level) => (
              <td key={level} className={cn('px-3 py-1.5 text-gray-600', tableText.body)}>
                {level === levels.length - 1 && summaryColumnIndex === 0 ? '합계' : ''}
              </td>
            ))}
            {summaryColumnIndex > 0 && (
              <td
                colSpan={summaryColumnIndex}
                className={cn('px-3 py-1.5 text-right text-gray-700', tableText.head)}
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
                <td className={cn('px-3 py-1.5 text-right tabular-nums text-gray-500', tableText.body)}>
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
        </tbody>
      </table>
    </div>
  )
}
