import { Button, Checkbox, IconButton, Input, Select, cardText, cn } from '@ynarcher/ui'
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import {
  COLUMN_TYPES,
  FIELD_TYPE_LABEL,
  canBePrimaryAmount,
  type FormColumn,
  type FormField,
  type FieldType,
} from '@/features/approval/fields'

interface FieldSchemaEditorProps {
  fields: FormField[]
  onChange: (fields: FormField[]) => void
}

/**
 * 새 필드·열의 키를 만든다. 키는 값이 저장되는 자리라 라벨과 분리되어야 한다 —
 * 라벨을 고칠 때마다 키가 바뀌면 이미 쌓인 문서의 값이 갈 곳을 잃는다.
 */
function nextKey(prefix: string, taken: string[]): string {
  let n = taken.length + 1
  while (taken.includes(`${prefix}${n}`)) n += 1
  return `${prefix}${n}`
}

const FIELD_TYPES = Object.keys(FIELD_TYPE_LABEL) as FieldType[]

/** 열 한 줄(표 필드 안). */
function ColumnRow({
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
        onChange={(e) =>
          onChange({
            ...column,
            type: e.target.value as FormColumn['type'],
            // 금액·숫자가 아니게 되면 대표 금액 표시도 함께 내린다.
            primaryAmount:
              e.target.value === 'MONEY' || e.target.value === 'NUMBER'
                ? column.primaryAmount
                : false,
          })
        }
      >
        {COLUMN_TYPES.map((t) => (
          <option key={t} value={t}>
            {FIELD_TYPE_LABEL[t]}
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
      {(column.type === 'MONEY' || column.type === 'NUMBER') && (
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

/**
 * 양식 필드 조립기 — ADMIN이 양식을 스스로 만들 때 쓰는 편집기.
 *
 * 여기서 만드는 것은 HTML이 아니라 **필드 정의 목록**이다. 금액을 금액 타입으로 받아 두면
 * 그 값은 나중에 표로 집계되고, 표(TABLE) 안의 금액 열에 '대표 금액'을 표시하면 그 합계가
 * 문서 금액이 되어 재무 집계로 흘러간다.
 */
export function FieldSchemaEditor({ fields, onChange }: FieldSchemaEditorProps) {
  const setField = (index: number, next: FormField) =>
    onChange(fields.map((f, i) => (i === index ? next : f)))

  const addField = () =>
    onChange([
      ...fields,
      {
        key: nextKey('field', fields.map((f) => f.key)),
        label: '',
        type: 'TEXT',
      },
    ])

  const move = (index: number, delta: number) => {
    const target = index + delta
    if (target < 0 || target >= fields.length) return
    const next = [...fields]
    const [item] = next.splice(index, 1)
    next.splice(target, 0, item!)
    onChange(next)
  }

  return (
    <div className="space-y-3">
      {fields.map((field, index) => (
        <div key={field.key} className="space-y-2 rounded-radius-md border border-gray-200 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              density="table"
              className="w-48"
              placeholder="필드 이름(라벨)"
              value={field.label}
              onChange={(e) => setField(index, { ...field, label: e.target.value })}
            />
            <Select
              density="table"
              className="w-36"
              value={field.type}
              onChange={(e) => {
                const type = e.target.value as FieldType
                setField(index, {
                  ...field,
                  type,
                  primaryAmount: canBePrimaryAmount(type) ? field.primaryAmount : false,
                  columns:
                    type === 'TABLE'
                      ? (field.columns ?? [
                          { key: 'col1', label: '항목', type: 'TEXT' },
                          { key: 'col2', label: '금액', type: 'MONEY', primaryAmount: true },
                        ])
                      : undefined,
                })
              }}
            >
              {FIELD_TYPES.map((t) => (
                <option key={t} value={t}>
                  {FIELD_TYPE_LABEL[t]}
                </option>
              ))}
            </Select>
            <Checkbox
              density="table"
              label="필수"
              checked={field.required ?? false}
              onChange={(e) => setField(index, { ...field, required: e.target.checked })}
            />
            {canBePrimaryAmount(field.type) && (
              <Checkbox
                density="table"
                label="대표 금액"
                checked={field.primaryAmount ?? false}
                onChange={(e) => setField(index, { ...field, primaryAmount: e.target.checked })}
              />
            )}
            <span className={cn('ml-auto', cardText.meta)}>{field.key}</span>
            <IconButton
              density="table"
              variant="ghost"
              label="위로"
              onClick={() => move(index, -1)}
              disabled={index === 0}
              icon={<ArrowUp size={14} />}
            />
            <IconButton
              density="table"
              variant="ghost"
              label="아래로"
              onClick={() => move(index, 1)}
              disabled={index === fields.length - 1}
              icon={<ArrowDown size={14} />}
            />
            <IconButton
              density="table"
              variant="ghost"
              danger
              label="필드 삭제"
              onClick={() => onChange(fields.filter((_, i) => i !== index))}
              icon={<Trash2 size={14} />}
            />
          </div>

          {field.type === 'SELECT' && (
            <Input
              density="table"
              placeholder="선택지(쉼표로 구분)"
              value={(field.options ?? []).join(', ')}
              onChange={(e) =>
                setField(index, {
                  ...field,
                  options: e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
                })
              }
            />
          )}

          {field.type === 'TABLE' && (
            <div className="space-y-2 border-t border-gray-100 pt-2">
              <p className={cardText.meta}>표의 열</p>
              {(field.columns ?? []).map((c, ci) => (
                <ColumnRow
                  key={c.key}
                  column={c}
                  canRemove={(field.columns ?? []).length > 1}
                  onChange={(next) =>
                    setField(index, {
                      ...field,
                      columns: (field.columns ?? []).map((x, i) => (i === ci ? next : x)),
                    })
                  }
                  onRemove={() =>
                    setField(index, {
                      ...field,
                      columns: (field.columns ?? []).filter((_, i) => i !== ci),
                    })
                  }
                />
              ))}
              <Button
                variant="ghost"
                density="table"
                onClick={() =>
                  setField(index, {
                    ...field,
                    columns: [
                      ...(field.columns ?? []),
                      {
                        key: nextKey('col', (field.columns ?? []).map((c) => c.key)),
                        label: '',
                        type: 'TEXT',
                      },
                    ],
                  })
                }
              >
                <Plus size={14} className="mr-1" />열 추가
              </Button>
            </div>
          )}
        </div>
      ))}

      <Button variant="outline" onClick={addField}>
        <Plus size={16} className="mr-1" />필드 추가
      </Button>
    </div>
  )
}
