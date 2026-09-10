import { cn, tableText } from '@ynarcher/ui'
import {
  budgetTotal,
  isLeaf,
  levelLabel,
  rollup,
  type BudgetTreeValue,
} from '@/features/approval/budget'
import {
  budgetAmountColumn,
  isNumericColumn,
  type FormColumn,
  type FormField,
} from '@/features/approval/fields'
import { formatMoney } from '@/features/approval/numeric'

/** 한 예산 줄에서 지금까지 나간 돈. 서버(approval_budget_status)가 답한다. */
export interface BudgetUsage {
  /** 승인이 끝난 지출. 예산에서 실제로 빠진 금액이다. */
  spent: number
  /** 아직 흐르는 중인 지출. 빠지지는 않았으나 곧 빠질 수 있다. */
  pending: number
}

interface Props {
  field: FormField
  value: BudgetTreeValue
  /** 줄 id → 사용 현황. 넘기지 않으면 예산만 보이는 표가 된다. */
  usage?: Map<string, BudgetUsage>
}

function numericText(column: FormColumn, n: number | null): string {
  if (n === null) return '-'
  return column.type === 'MONEY' ? formatMoney(n) : n.toLocaleString('ko-KR')
}

/**
 * 예산표 읽기 — 층 있는 표를 그대로 세우고, 사용 현황을 받으면 `사용 · 결재 중 · 남음` 세 열을
 * 오른쪽에 덧붙인다.
 *
 * **남는 금액이 마이너스여도 막지 않고 빨갛게 적기만 한다**(기획 확정). 시스템이 막으면
 * 예외마다 담당자가 우회로를 찾게 되고 그 우회로는 기록에 남지 않는다. 걸러 내는 일은
 * 결재자의 반려가 한다 — 그러려면 결재자가 초과 사실을 문서에서 볼 수 있어야 한다.
 *
 * 사용 현황은 위층에도 선다(아래 줄들의 합) — 담당자가 보는 단위는 대개 세세목이 아니라
 * 그 위층이기 때문이다.
 */
export function BudgetTreeView({ field, value, usage }: Props) {
  const columns = field.columns ?? []
  const rows = value.rows
  const sums = columns.map((c) => rollup(rows, c.key))
  // 예산·남음이 보는 열은 하나다 — 양식이 대표 금액으로 지정한 열(없으면 첫 금액 열).
  const amountIndex = columns.findIndex((c) => c === budgetAmountColumn(field))

  if (rows.length === 0) {
    return <p className={cn('py-2', tableText.empty)}>작성된 예산이 없습니다.</p>
  }

  /** 그 줄과 아래 줄들의 사용 합계. 위층은 아래에서 올라온 값으로 답한다. */
  const usageOf = (index: number): BudgetUsage | null => {
    if (!usage) return null
    if (isLeaf(rows, index)) return usage.get(rows[index]!.id) ?? { spent: 0, pending: 0 }
    const depth = rows[index]!.depth
    let spent = 0
    let pending = 0
    for (let j = index + 1; j < rows.length && rows[j]!.depth > depth; j += 1) {
      if (!isLeaf(rows, j)) continue
      const u = usage.get(rows[j]!.id)
      if (u) {
        spent += u.spent
        pending += u.pending
      }
    }
    return { spent, pending }
  }

  const totalBudget = budgetTotal(rows, columns[amountIndex]?.key ?? '')
  const totalUsage = usage
    ? [...usage.values()].reduce(
        (acc, u) => ({ spent: acc.spent + u.spent, pending: acc.pending + u.pending }),
        { spent: 0, pending: 0 },
      )
    : null

  return (
    <div className="overflow-x-auto rounded-radius-md border border-gray-200">
      <table className="w-full min-w-[40rem] border-collapse">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-25">
            <th className={cn('px-3 py-1.5 text-left', tableText.head)}>항목</th>
            {columns.map((c) => (
              <th
                key={c.key}
                className={cn(
                  'px-3 py-1.5 text-left',
                  tableText.head,
                  isNumericColumn(c.type) && 'w-32 text-right',
                )}
              >
                {c.label}
              </th>
            ))}
            {usage && (
              <>
                <th className={cn('w-32 px-3 py-1.5 text-right', tableText.head)}>사용</th>
                <th className={cn('w-32 px-3 py-1.5 text-right', tableText.head)}>결재 중</th>
                <th className={cn('w-32 px-3 py-1.5 text-right', tableText.head)}>남음</th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const leaf = isLeaf(rows, i)
            const u = usageOf(i)
            const budget = sums[amountIndex]?.get(row.id) ?? null
            const remaining = u && budget !== null ? budget - u.spent : null
            return (
              <tr key={row.id} className="border-b border-gray-100 last:border-b-0">
                <td className={cn('px-3 py-1.5', tableText.body)}>
                  <div style={{ paddingLeft: `${row.depth * 1.25}rem` }} className="flex gap-1.5">
                    <span className={cn('shrink-0', tableText.meta)}>
                      {levelLabel(value.levels, row.depth)}
                    </span>
                    <span className={cn(!leaf && 'font-medium')}>{row.name || '-'}</span>
                  </div>
                </td>
                {columns.map((c, ci) => (
                  <td
                    key={c.key}
                    className={cn(
                      'px-3 py-1.5',
                      tableText.body,
                      isNumericColumn(c.type) && 'text-right tabular-nums',
                      // 위층 숫자는 파생값이라 한 톤 물러난다 — 적힌 값과 계산된 값을 가른다.
                      isNumericColumn(c.type) && !leaf && 'text-gray-500',
                    )}
                  >
                    {isNumericColumn(c.type)
                      ? numericText(c, sums[ci]!.get(row.id) ?? null)
                      : (row.values[c.key] ?? '') || '-'}
                  </td>
                ))}
                {usage && (
                  <>
                    <td className={cn('px-3 py-1.5 text-right tabular-nums', tableText.body)}>
                      {u && u.spent ? formatMoney(u.spent) : '-'}
                    </td>
                    <td
                      className={cn(
                        'px-3 py-1.5 text-right tabular-nums text-gray-500',
                        tableText.body,
                      )}
                    >
                      {u && u.pending ? formatMoney(u.pending) : '-'}
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
                  </>
                )}
              </tr>
            )
          })}

          <tr className="border-t border-gray-200 bg-gray-25">
            <td className={cn('px-3 py-1.5 text-gray-600', tableText.body)}>합계</td>
            {columns.map((c) => (
              <td
                key={c.key}
                className={cn(
                  'px-3 py-1.5',
                  tableText.body,
                  isNumericColumn(c.type) && 'text-right font-semibold tabular-nums',
                )}
              >
                {isNumericColumn(c.type) ? numericText(c, budgetTotal(rows, c.key)) : ''}
              </td>
            ))}
            {usage && totalUsage && (
              <>
                <td
                  className={cn('px-3 py-1.5 text-right font-semibold tabular-nums', tableText.body)}
                >
                  {formatMoney(totalUsage.spent)}
                </td>
                <td
                  className={cn('px-3 py-1.5 text-right tabular-nums text-gray-500', tableText.body)}
                >
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
              </>
            )}
          </tr>
        </tbody>
      </table>
    </div>
  )
}
