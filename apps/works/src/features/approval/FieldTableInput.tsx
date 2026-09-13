import { Button, IconButton, Input, Select, cn, tableText } from '@ynarcher/ui'
import { Plus, Trash2 } from 'lucide-react'
import { BudgetRefCell } from '@/features/approval/BudgetRefCell'
import { PartnerRefCell } from '@/features/approval/PartnerRefCell'
import {
  amountKeys,
  columnSum,
  emptyRow,
  formatMoney,
  hasVatColumns,
  isNumericColumn,
  type FormColumn,
  type FormField,
  type TableRow,
} from '@/features/approval/fields'
import {
  VAT_KINDS,
  VAT_KIND_LABEL,
  applyAmountEdit,
  readAmounts,
  validateAmounts,
} from '@/features/approval/vat'

interface FieldTableInputProps {
  field: FormField
  rows: TableRow[]
  onChange: (rows: TableRow[]) => void
}

/** 열 종류에 맞는 입력 한 칸. 숫자·금액은 자릿수를 견주도록 우측 정렬한다. */
function CellInput({
  column,
  value,
  onChange,
}: {
  column: FormColumn
  value: string
  onChange: (v: string) => void
}) {
  // 다른 원장의 행을 가리키는 칸은 글자를 적는 자리가 아니라 **고르는 자리**다.
  // 자기 부품이 자기 선택 창을 갖는다(표는 어느 원장인지 알 필요가 없다).
  if (column.type === 'BUDGET_REF') {
    return <BudgetRefCell value={value} onChange={onChange} />
  }
  if (column.type === 'PARTNER_REF') {
    return <PartnerRefCell value={value} onChange={onChange} />
  }
  if (column.type === 'SELECT' || column.type === 'VAT_KIND') {
    // 과세 유형의 선택지는 양식이 아니라 vat.ts가 갖는다 — 양식마다 적어 넣게 두면
    // '면세'와 '면세(0%)'가 섞여 부가세 신고 자료를 다시 만들 수 없다.
    const options =
      column.type === 'VAT_KIND'
        ? VAT_KINDS.map((k) => ({ value: k, label: VAT_KIND_LABEL[k] }))
        : (column.options ?? []).map((o) => ({ value: o, label: o }))
    return (
      <Select density="table" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">선택</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>
    )
  }
  return (
    <Input
      density="table"
      type={column.type === 'DATE' ? 'date' : 'text'}
      inputMode={isNumericColumn(column.type) ? 'numeric' : undefined}
      className={cn(
        isNumericColumn(column.type) && 'text-right tabular-nums',
      )}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  )
}

/**
 * 표 필드 입력 — 이 부품이 전자결재를 다시 만든 이유다.
 *
 * 지출 내역을 리치텍스트 표에 적으면 금액이 문자열 속 글자로만 남아, 나중에 합계를 내려면
 * 사람이 문서를 열어 옮겨 적어야 한다. 열마다 종류(type)를 갖는 표로 받으면 금액 열의 합계를
 * 입력 중에 바로 보여줄 수 있고, 저장된 값도 그대로 집계된다.
 *
 * 합계 행은 금액·숫자 열에만 붙는다(항목명 열의 합계는 뜻이 없다).
 */
export function FieldTableInput({ field, rows, onChange }: FieldTableInputProps) {
  const columns = field.columns ?? []
  const numericColumns = columns.filter((c) => isNumericColumn(c.type))
  const keys = amountKeys(field)
  const vatRows = hasVatColumns(field)

  // 한 칸을 고치면 같은 줄의 나머지 금액 칸이 따라간다. 규칙은 vat.ts 한 곳에만 있고
  // 예산표 입력도 같은 함수를 쓴다.
  const setCell = (index: number, key: string, value: string) =>
    onChange(
      rows.map((r, i) => {
        if (i !== index) return r
        const next = { ...r, [key]: value }
        return keys ? applyAmountEdit(next, keys, key) : next
      }),
    )

  // 상신 전에 서버가 같은 규칙으로 다시 본다(app.assert_approval_amounts). 여기서 먼저
  // 보이는 이유는 되돌아오는 오류보다 적는 자리에서 알려 주는 편이 낫기 때문이다.
  const issues = !keys || !vatRows
    ? []
    : rows
        .map((r, i) => {
          const amounts = readAmounts(r, keys)
          const message = validateAmounts(amounts, amounts.kind, true)
          return message ? `${i + 1}행: ${message}` : null
        })
        .filter((m): m is string => m !== null)

  const addRow = () => onChange([...rows, emptyRow(field)])
  const removeRow = (index: number) => onChange(rows.filter((_, i) => i !== index))

  return (
    <div className="relative min-w-0 max-w-full overflow-x-auto rounded-radius-md border border-gray-200">
      <table className="w-full min-w-[32rem] border-collapse">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-25">
            {columns.map((c) => (
              <th
                key={c.key}
                className={cn(
                  'px-2 py-1.5 text-left',
                  tableText.head,
                  isNumericColumn(c.type) && 'text-right',
                )}
              >
                {c.label}
              </th>
            ))}
            {/* 행 삭제 열: 값이 아니라 조작이 놓이는 자리라 가운데. */}
            <th className="w-12 px-2 py-1.5 text-center">
              <span className="sr-only">행 삭제</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index} className="border-b border-gray-100 last:border-b-0">
              {columns.map((c) => (
                <td key={c.key} className="px-2 py-1">
                  <CellInput
                    column={c}
                    value={row[c.key] ?? ''}
                    onChange={(v) => setCell(index, c.key, v)}
                  />
                </td>
              ))}
              <td className="px-2 py-1 text-center">
                <IconButton
                  density="table"
                  variant="ghost"
                  danger
                  label="행 삭제"
                  onClick={() => removeRow(index)}
                  // 마지막 한 행은 남긴다 — 표가 통째로 사라지면 무엇을 적는 자리였는지 알 수 없다.
                  disabled={rows.length <= 1}
                  icon={<Trash2 size={14} />}
                />
              </td>
            </tr>
          ))}

          {numericColumns.length > 0 && (
            <tr className="border-t border-gray-200 bg-gray-25">
              {columns.map((c, i) => {
                const numeric = isNumericColumn(c.type)
                const sum = numeric ? columnSum(rows, c.key) : null
                return (
                  <td
                    key={c.key}
                    className={cn(
                      'px-2 py-1.5',
                      tableText.body,
                      numeric ? 'text-right font-semibold tabular-nums' : 'text-gray-600',
                    )}
                  >
                    {numeric
                      ? c.type === 'MONEY'
                        ? formatMoney(sum)
                        : (sum ?? 0).toLocaleString('ko-KR')
                      : i === 0
                        ? '합계'
                        : ''}
                  </td>
                )
              })}
              <td />
            </tr>
          )}
        </tbody>
      </table>

      {issues.length > 0 && (
        <ul className={cn('border-t border-gray-100 px-3 py-2 text-danger', tableText.body)}>
          {issues.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      )}

      <div className="border-t border-gray-100 p-2">
        <Button variant="ghost" density="table" onClick={addRow}>
          <Plus size={14} className="mr-1" />행 추가
        </Button>
      </div>
    </div>
  )
}
