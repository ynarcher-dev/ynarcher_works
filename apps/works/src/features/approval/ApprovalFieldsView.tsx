import { cn, tableText } from '@ynarcher/ui'
import { RichTextViewer } from '@/components/RichTextEditor'
import {
  columnSum,
  displayValue,
  formatMoney,
  scalarValue,
  tableRows,
  toNumber,
  type FieldValues,
  type FormField,
} from '@/features/approval/fields'

interface ApprovalFieldsViewProps {
  fields: FormField[]
  values: FieldValues
}

/** 표 필드 하나를 읽기 전용으로 편다. 금액·숫자 열에는 합계 행이 붙는다. */
function TableView({ field, values }: { field: FormField; values: FieldValues }) {
  const columns = field.columns ?? []
  const rows = tableRows(values, field.key)
  const hasNumeric = columns.some((c) => c.type === 'MONEY' || c.type === 'NUMBER')

  if (rows.length === 0) {
    return <p className={cn('py-2', tableText.empty)}>입력된 내역이 없습니다.</p>
  }

  return (
    <div className="overflow-x-auto rounded-radius-md border border-gray-200">
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-25">
            {columns.map((c) => (
              <th
                key={c.key}
                className={cn(
                  'px-3 py-1.5 text-left',
                  tableText.head,
                  (c.type === 'MONEY' || c.type === 'NUMBER') && 'text-right',
                )}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-gray-100 last:border-b-0">
              {columns.map((c) => {
                const raw = row[c.key] ?? ''
                const numeric = c.type === 'MONEY' || c.type === 'NUMBER'
                const n = numeric ? toNumber(raw) : null
                return (
                  <td
                    key={c.key}
                    className={cn(
                      'px-3 py-1.5',
                      tableText.body,
                      numeric && 'text-right tabular-nums',
                    )}
                  >
                    {numeric && n !== null
                      ? c.type === 'MONEY'
                        ? formatMoney(n)
                        : n.toLocaleString('ko-KR')
                      : raw || '-'}
                  </td>
                )
              })}
            </tr>
          ))}
          {hasNumeric && (
            <tr className="border-t border-gray-200 bg-gray-25">
              {columns.map((c, i) => {
                const numeric = c.type === 'MONEY' || c.type === 'NUMBER'
                return (
                  <td
                    key={c.key}
                    className={cn(
                      'px-3 py-1.5',
                      tableText.body,
                      numeric ? 'text-right font-semibold tabular-nums' : 'text-gray-600',
                    )}
                  >
                    {numeric
                      ? c.type === 'MONEY'
                        ? formatMoney(columnSum(rows, c.key))
                        : columnSum(rows, c.key).toLocaleString('ko-KR')
                      : i === 0
                        ? '합계'
                        : ''}
                  </td>
                )
              })}
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

/**
 * 문서 본문 — 스키마와 값을 받아 라벨:값으로 편다.
 *
 * 하이웍스가 HTML로 그리던 문서 표와 같은 모양이되, 그리는 근거가 저장된 마크업이 아니라
 * 양식 스키마다. 표는 자기 격자를 갖고, 서식 있는 본문(RICHTEXT)만 라벨 없이 통으로 흐른다 —
 * 서술형 본문에 좁은 값 칸을 씌우면 문장이 반 폭으로 잘린다.
 */
export function ApprovalFieldsView({ fields, values }: ApprovalFieldsViewProps) {
  if (fields.length === 0) {
    return <p className={cn('py-4', tableText.empty)}>표시할 내용이 없습니다.</p>
  }

  return (
    <div className="space-y-4">
      {fields.map((field) => {
        if (field.type === 'RICHTEXT') {
          const html = scalarValue(values, field.key)
          return (
            <section key={field.key} className="space-y-1">
              <h4 className={tableText.head}>{field.label}</h4>
              {html.replace(/<[^>]*>/g, '').trim() ? (
                <RichTextViewer html={html} />
              ) : (
                <p className={tableText.empty}>내용이 없습니다.</p>
              )}
            </section>
          )
        }

        if (field.type === 'TABLE') {
          return (
            <section key={field.key} className="space-y-1">
              <h4 className={tableText.head}>{field.label}</h4>
              <TableView field={field} values={values} />
            </section>
          )
        }

        // 스칼라는 라벨:값 한 줄. 여러 줄 글은 줄바꿈을 살린다.
        return (
          <div
            key={field.key}
            className="grid grid-cols-[8rem_1fr] items-start gap-3 border-b border-gray-100 pb-2 last:border-b-0"
          >
            <span className={tableText.head}>{field.label}</span>
            <span
              className={cn(
                tableText.body,
                field.type === 'TEXTAREA' && 'whitespace-pre-wrap',
                (field.type === 'MONEY' || field.type === 'NUMBER') && 'tabular-nums',
              )}
            >
              {displayValue(field, values)}
            </span>
          </div>
        )
      })}
    </div>
  )
}
