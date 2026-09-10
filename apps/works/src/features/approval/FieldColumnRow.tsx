import { Checkbox, IconButton, Input, Select } from '@ynarcher/ui'
import { Trash2 } from 'lucide-react'
import {
  COLUMN_TYPES,
  COLUMN_TYPE_LABEL,
  isNumericColumn,
  type ColumnType,
  type FormColumn,
} from '@/features/approval/fields'

/** 열 한 줄(표 필드 안). */
export function FieldColumnRow({
  column,
  onChange,
  onRemove,
  canRemove,
}: {
  column: FormColumn
  onChange: (c: FormColumn) => void
  onRemove: () => void
  canRemove: boolean
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        density="table"
        className="w-40"
        value={column.label}
        placeholder="열 이름"
        onChange={(e) => onChange({ ...column, label: e.target.value })}
      />
      <Select
        density="table"
        className="w-28"
        value={column.type}
        onChange={(e) => {
          const type = e.target.value as ColumnType
          onChange({
            ...column,
            type,
            // 금액·숫자가 아니게 되면 대표 금액 표시도 함께 내린다.
            primaryAmount: isNumericColumn(type) ? column.primaryAmount : false,
          })
        }}
      >
        {COLUMN_TYPES.map((t) => (
          <option key={t} value={t}>
            {COLUMN_TYPE_LABEL[t]}
          </option>
        ))}
      </Select>
      {column.type === 'SELECT' && (
        <Input
          density="table"
          className="w-48"
          placeholder="선택지(쉼표로 구분)"
          value={(column.options ?? []).join(', ')}
          onChange={(e) =>
            onChange({
              ...column,
              options: e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
            })
          }
        />
      )}
      {isNumericColumn(column.type) && (
        <Checkbox
          density="table"
          label="대표 금액"
          checked={column.primaryAmount ?? false}
          onChange={(e) => onChange({ ...column, primaryAmount: e.target.checked })}
        />
      )}
      <IconButton
        density="table"
        variant="ghost"
        danger
        label="열 삭제"
        onClick={onRemove}
        disabled={!canRemove}
        icon={<Trash2 size={14} />}
      />
    </div>
  )
}
