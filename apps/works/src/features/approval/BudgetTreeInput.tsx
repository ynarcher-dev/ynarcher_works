import { Button, Input, cn, tableText } from '@ynarcher/ui'
import { Plus } from 'lucide-react'
import { BudgetRowActions } from '@/features/approval/BudgetRowActions'
import {
  budgetTotal,
  isLeaf,
  levelLabel,
  rollup,
  type BudgetTreeValue,
} from '@/features/approval/budget'
import {
  addSibling,
  appendRoot,
  indent,
  moveRow,
  outdent,
  removeRow,
  setCell,
  setLevel,
  setName,
  usedDepth,
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
 * 품의서 예산표 입력 — 층(트리)이 있는 표.
 *
 * **금액을 적는 칸은 맨 아래 줄에만 선다.** 위층에는 입력 칸 대신 아래에서 올라온 합이
 * 회색으로 서며, 그 자리를 눌러도 고칠 수 없다. 사람이 위층에도 적을 수 있게 두면 위와
 * 아래가 어긋나는 날이 오고, 그때 어느 쪽이 진짜 예산인지 판정할 근거가 없다.
 *
 * 층 이름 칸이 표 위에 따로 서는 이유는 **사업마다 층 이름이 다르기 때문이다**
 * (`대분류 › 중분류` / `세목 › 비목 › 세세목`). 이름을 코드가 정하면 그 목록에 없는 사업은
 * 예산을 적을 수 없으므로, 이름은 문서가 갖고 코드는 몇 번째 층인지만 안다.
 *
 * 줄 조작(`+ ← → ↑ ↓ 🗑`)은 언제나 그 줄에 딸린 아래 줄까지 함께 움직인다(budgetEdit).
 */
export function BudgetTreeInput({ field, value, onChange }: Props) {
  const columns = field.columns ?? []
  const amountColumn = budgetAmountColumn(field)
  const rows = value.rows
  const depth = usedDepth(rows)
  // 층 이름 칸은 지금 쓰는 층보다 하나 더 세운다 — 다음 층으로 들이기 전에 이름을 적어 둘 수
  // 있어야 하고, 그러지 않으면 이름 없는 층이 먼저 생긴다.
  const levelSlots = Array.from({ length: depth + 1 }, (_, i) => i)
  const sums = columns.map((c) => rollup(rows, c.key))

  return (
    <div className="space-y-2">
      {/* 층 이름 — 값에 저장되며 양식은 기본값만 준다. */}
      <div className="flex flex-wrap items-center gap-2">
        <span className={tableText.head}>층 이름</span>
        {levelSlots.map((d) => (
          <Input
            key={d}
            density="table"
            className="w-28"
            placeholder={`${d + 1}단계`}
            value={value.levels[d] ?? ''}
            onChange={(e) => onChange(setLevel(value, d, e.target.value))}
          />
        ))}
      </div>

      <div className="overflow-x-auto rounded-radius-md border border-gray-200">
        <table className="w-full min-w-[44rem] border-collapse">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-25">
              <th className={cn('px-2 py-1.5 text-left', tableText.head)}>항목</th>
              {columns.map((c) => (
                <th
                  key={c.key}
                  className={cn(
                    'px-2 py-1.5 text-left',
                    tableText.head,
                    isNumericColumn(c.type) ? 'w-32 text-right' : c.wide ? 'w-48' : 'w-28',
                  )}
                >
                  {c.label}
                </th>
              ))}
              <th className="w-40 px-2 py-1.5 text-center">
                <span className="sr-only">줄 조작</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const leaf = isLeaf(rows, i)
              return (
                <tr key={row.id} className="border-b border-gray-100 last:border-b-0">
                  <td className="px-2 py-1">
                    <div
                      className="flex items-center gap-1.5"
                      style={{ paddingLeft: `${row.depth * 1.25}rem` }}
                    >
                      {/* 층 이름표 — 이 줄이 몇 번째 층인지 들여쓰기만으로는 세다가 놓친다. */}
                      <span className={cn('shrink-0', tableText.meta)}>
                        {levelLabel(value.levels, row.depth)}
                      </span>
                      <Input
                        density="table"
                        className="min-w-0 flex-1"
                        value={row.name}
                        onChange={(e) => onChange(setName(value, i, e.target.value))}
                      />
                    </div>
                  </td>

                  {columns.map((c, ci) => {
                    // 숫자 열은 맨 아래 줄에만 입력 칸이 선다. 위층은 아래에서 올라온 합이다.
                    if (isNumericColumn(c.type) && !leaf) {
                      const sum = sums[ci]!.get(row.id) ?? null
                      return (
                        <td
                          key={c.key}
                          className={cn(
                            'px-2 py-1 text-right tabular-nums',
                            tableText.body,
                            'text-gray-500',
                          )}
                        >
                          {c.type === 'MONEY'
                            ? formatMoney(sum)
                            : (sum?.toLocaleString('ko-KR') ?? '-')}
                        </td>
                      )
                    }
                    return (
                      <td key={c.key} className="px-2 py-1">
                        <Input
                          density="table"
                          type={c.type === 'DATE' ? 'date' : 'text'}
                          inputMode={isNumericColumn(c.type) ? 'numeric' : undefined}
                          className={cn(isNumericColumn(c.type) && 'text-right tabular-nums')}
                          value={row.values[c.key] ?? ''}
                          onChange={(e) => onChange(setCell(value, i, c.key, e.target.value))}
                        />
                      </td>
                    )
                  })}

                  <td className="px-2 py-1">
                    <BudgetRowActions
                      rows={rows}
                      index={i}
                      onAddSibling={() => onChange(addSibling(value, i))}
                      onOutdent={() => onChange(outdent(value, i))}
                      onIndent={() => onChange(indent(value, i))}
                      onMoveUp={() => onChange(moveRow(value, i, -1))}
                      onMoveDown={() => onChange(moveRow(value, i, 1))}
                      onRemove={() => onChange(removeRow(value, i))}
                    />
                  </td>
                </tr>
              )
            })}

            {/* 합계 — 맨 아래 줄들의 합이다. 위층을 함께 세면 두 번 센다. */}
            <tr className="border-t border-gray-200 bg-gray-25">
              <td className={cn('px-2 py-1.5 text-gray-600', tableText.body)}>합계</td>
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={cn(
                    'px-2 py-1.5',
                    tableText.body,
                    isNumericColumn(c.type) && 'text-right font-semibold tabular-nums',
                  )}
                >
                  {isNumericColumn(c.type)
                    ? numericText(c, String(budgetTotal(rows, c.key) ?? ''))
                    : ''}
                </td>
              ))}
              <td />
            </tr>
          </tbody>
        </table>

        <div className="border-t border-gray-100 p-2">
          <Button variant="ghost" density="table" onClick={() => onChange(appendRoot(value))}>
            <Plus size={14} className="mr-1" />
            {levelLabel(value.levels, 0)} 추가
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
