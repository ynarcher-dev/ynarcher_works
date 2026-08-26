import { Button, IconButton, Input, Select, cn, tableText } from '@ynarcher/ui'
import { Plus, Trash2 } from 'lucide-react'
import {
  columnSum,
  emptyRow,
  formatMoney,
  type FormColumn,
  type FormField,
  type TableRow,
} from '@/features/approval/fields'

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
  if (column.type === 'SELECT') {
    return (
      <Select density="table" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">선택</option>
        {(column.options ?? []).map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </Select>
    )
  }
  return (
    <Input
      density="table"
      type={column.type === 'DATE' ? 'date' : 'text'}
      inputMode={column.type === 'MONEY' || column.type === 'NUMBER' ? 'numeric' : undefined}
      className={cn(
        (column.type === 'MONEY' || column.type === 'NUMBER') && 'text-right tabular-nums',
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
  const numericColumns = columns.filter((c) => c.type === 'MONEY' || c.type === 'NUMBER')

  const setCell = (index: number, key: string, value: string) =>
    onChange(rows.map((r, i) => (i === index ? { ...r, [key]: value } : r)))

  const addRow = () => onChange([...rows, emptyRow(field)])
  const removeRow = (index: number) => onChange(rows.filter((_, i) => i !== index))

  return (
    <div className="overflow-x-auto rounded-radius-md border border-gray-200">
      <table className="w-full min-w-[32rem] border-collapse">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-25">
            {columns.map((c) => (
              <th
                key={c.key}
                className={cn(
                  'px-2 py-1.5 text-left',
                  tableText.head,
                  (c.type === 'MONEY' || c.type === 'NUMBER') && 'text-right',
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
                const numeric = c.type === 'MONEY' || c.type === 'NUMBER'
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

      <div className="border-t border-gray-100 p-2">
        <Button variant="ghost" density="table" onClick={addRow}>
          <Plus size={14} className="mr-1" />행 추가
        </Button>
      </div>
    </div>
  )
}
