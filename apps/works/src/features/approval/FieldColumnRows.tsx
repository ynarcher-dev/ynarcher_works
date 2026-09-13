import { Button, Checkbox, Input, Select } from '@ynarcher/ui'
import { ItemRows, patchAt, removeAt, type ItemCol } from '@/components/ItemRows'
import {
  AMOUNT_ROLE_LABEL,
  COLUMN_TYPES,
  COLUMN_TYPE_LABEL,
  isNumericColumn,
  nextKey,
  withVatColumns,
  type AmountRole,
  type ColumnType,
  type FormColumn,
} from '@/features/approval/fields'

/**
 * 열 한 줄의 칸들.
 *
 * 선택지 열은 **고른 종류 중에 '선택'이 있을 때만 선다** — 없으면 모든 줄이 빈 칸이라 가르는 것
 * 없이 이름 열의 폭만 가져간다(자료 표의 '위치' 열과 같은 규칙). 부가세 역할 열도 같은 규칙으로,
 * 금액·숫자 열이 하나도 없는 표에서는 서지 않는다.
 */
function columnCols(hasSelect: boolean, hasNumeric: boolean): ItemCol[] {
  return [
    { label: '열 이름' },
    { label: '종류', kind: 'pick' },
    ...(hasSelect ? [{ label: '선택지' } as ItemCol] : []),
    ...(hasNumeric ? [{ label: '역할', kind: 'pick' } as ItemCol] : []),
    { label: '대표 금액', kind: 'flag' },
  ]
}

/**
 * 표·예산표의 열 정의 — 필드 줄 아래에 서는 목록.
 *
 * 금액 열에 '대표 금액'을 표시하면 그 열의 합계가 문서 금액이 되어 재무 집계로 이어진다.
 * 열이 하나도 없는 표는 성립하지 않으므로 마지막 한 줄은 지울 수 없다.
 */
export function FieldColumnRows({
  title,
  columns,
  onChange,
}: {
  title: string
  columns: FormColumn[]
  onChange: (next: FormColumn[]) => void
}) {
  const hasSelect = columns.some((c) => c.type === 'SELECT')
  const hasNumeric = columns.some((c) => isNumericColumn(c.type))
  // 이미 쪼개 적고 있으면 다시 권하지 않는다 — 누르면 아무 일도 안 하는 버튼은 고장으로 읽힌다.
  const vatReady =
    columns.some((c) => c.role === 'NET') && columns.some((c) => c.role === 'VAT')

  return (
    <div className="min-w-0 space-y-2">
    <ItemRows
      title={title}
      cols={columnCols(hasSelect, hasNumeric)}
      rows={columns}
      rowKey={(c) => c.key}
      onRemove={(i) => {
        if (columns.length <= 1) return
        onChange(removeAt(columns, i))
      }}
      onAdd={() =>
        onChange([
          ...columns,
          { key: nextKey('col', columns.map((c) => c.key)), label: '', type: 'TEXT' },
        ])
      }
      addLabel="열 추가"
    >
      {(column, i) => {
        const patch = (p: Partial<FormColumn>) => onChange(patchAt(columns, i, p))
        return (
          <>
            <Input
              placeholder="열 이름"
              value={column.label}
              onChange={(e) => patch({ label: e.target.value })}
            />
            <Select
              value={column.type}
              onChange={(e) => {
                const type = e.target.value as ColumnType
                // 금액·숫자가 아니게 되면 대표 금액 표시와 역할도 함께 내린다.
                const numeric = isNumericColumn(type)
                patch({
                  type,
                  primaryAmount: numeric ? column.primaryAmount : false,
                  role: numeric ? column.role : undefined,
                })
              }}
            >
              {COLUMN_TYPES.map((t) => (
                <option key={t} value={t}>
                  {COLUMN_TYPE_LABEL[t]}
                </option>
              ))}
            </Select>
            {hasSelect &&
              (column.type === 'SELECT' ? (
                <Input
                  placeholder="선택지(쉼표로 구분)"
                  value={(column.options ?? []).join(', ')}
                  onChange={(e) =>
                    patch({
                      options: e.target.value
                        .split(',')
                        .map((s) => s.trim())
                        .filter(Boolean),
                    })
                  }
                />
              ) : (
                <span aria-hidden />
              ))}
            {hasNumeric &&
              (isNumericColumn(column.type) ? (
                <Select
                  aria-label="금액 역할"
                  title="부가세를 쪼개 적는 표에서 이 열이 맡는 자리입니다."
                  value={column.role ?? ''}
                  onChange={(e) =>
                    patch({ role: (e.target.value || undefined) as AmountRole | undefined })
                  }
                >
                  <option value="">지정 안 함</option>
                  {(Object.keys(AMOUNT_ROLE_LABEL) as AmountRole[]).map((r) => (
                    <option key={r} value={r}>
                      {AMOUNT_ROLE_LABEL[r]}
                    </option>
                  ))}
                </Select>
              ) : (
                <span aria-hidden />
              ))}
            {isNumericColumn(column.type) ? (
              <Checkbox
                aria-label="대표 금액"
                title="이 열의 합계가 문서 금액이 됩니다."
                checked={column.primaryAmount ?? false}
                onChange={(e) => patch({ primaryAmount: e.target.checked })}
              />
            ) : (
              <span aria-hidden />
            )}
          </>
        )
      }}
    </ItemRows>
      {hasNumeric && !vatReady && (
        <Button variant="ghost" density="table" onClick={() => onChange(withVatColumns(columns))}>
          부가세 칸 추가
        </Button>
      )}
    </div>
  )
}
