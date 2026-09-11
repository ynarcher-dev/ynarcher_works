import { Button, Checkbox, Field, IconButton, Input, Select, cardText, cn } from '@ynarcher/ui'
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Trash2 } from 'lucide-react'
import { Fragment, useEffect, useState } from 'react'
import { FieldExtraSettings, hasFieldExtras } from '@/features/approval/FieldExtraSettings'
import {
  FIELD_TYPES,
  FIELD_TYPE_LABEL,
  canBePrimaryAmount,
  nextKey,
  withFieldType,
  type FieldType,
  type FormField,
} from '@/features/approval/fields'

interface FieldSchemaEditorProps {
  fields: FormField[]
  onChange: (fields: FormField[]) => void
}

/**
 * 양식 필드 조립기 — 문서에 보이는 순서를 먼저 훑고, 고른 필드 하나만 자세히 편집한다.
 *
 * 필드마다 이름·종류·필수·대표 금액·저장 키와 표의 열 설정까지 전부 펼치면, 양식의 실제
 * 모양보다 설정 칸이 먼저 보인다. 목록에는 사람이 문서에서 보게 될 이름과 입력 방식만 남기고
 * 기술 설정은 선택한 줄 아래에 한 벌만 연다. 저장 키는 기존 문서 값의 주소라 읽기 전용이다.
 */
export function FieldSchemaEditor({ fields, onChange }: FieldSchemaEditorProps) {
  const [selectedKey, setSelectedKey] = useState<string | null>(fields[0]?.key ?? null)

  useEffect(() => {
    if (fields.length === 0) {
      setSelectedKey(null)
    } else if (!fields.some((field) => field.key === selectedKey)) {
      setSelectedKey(fields[0]!.key)
    }
  }, [fields, selectedKey])

  const setField = (index: number, next: FormField) =>
    onChange(fields.map((field, i) => (i === index ? next : field)))

  const removeField = (index: number) => {
    const removing = fields[index]
    if (removing?.key === selectedKey) {
      setSelectedKey(fields[index + 1]?.key ?? fields[index - 1]?.key ?? null)
    }
    onChange(fields.filter((_, i) => i !== index))
  }

  /** 줄을 위아래로 옮긴다 — 이 차례가 곧 문서에 서는 차례다. */
  const move = (index: number, delta: number) => {
    const target = index + delta
    if (target < 0 || target >= fields.length) return
    const next = [...fields]
    const [item] = next.splice(index, 1)
    next.splice(target, 0, item!)
    onChange(next)
  }

  const addField = () => {
    const key = nextKey('field', fields.map((field) => field.key))
    onChange([...fields, { key, label: '', type: 'TEXT' }])
    setSelectedKey(key)
  }

  return (
    <div className="space-y-3">
      <p className={cardText.meta}>위에서부터 문서에 표시됩니다. 편집할 필드만 선택하세요.</p>

      {fields.length > 0 && (
        <div className="overflow-hidden rounded-radius-md border border-gray-200 bg-white">
          {fields.map((field, index) => {
            const selected = selectedKey === field.key
            const amount = field.primaryAmount && canBePrimaryAmount(field.type)
            return (
              <Fragment key={field.key}>
                <div
                  className={cn(
                    'flex min-h-12 items-center gap-2 border-b border-gray-200 px-3 last:border-b-0',
                    selected ? 'bg-brand-25' : 'hover:bg-gray-25',
                  )}
                >
                  <button
                    type="button"
                    aria-expanded={selected}
                    onClick={() => setSelectedKey(field.key)}
                    className="flex min-w-0 flex-1 items-center gap-3 py-2 text-left focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/10"
                  >
                    <span className="w-5 shrink-0 text-center text-caption tabular-nums text-gray-500">
                      {index + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={cn('block truncate', cardText.label)}>
                        {field.label.trim() || '이름 없는 필드'}
                      </span>
                      <span className={cn('block truncate', cardText.meta)}>
                        {FIELD_TYPE_LABEL[field.type]}
                        {field.required ? ' · 필수' : ''}
                        {amount ? ' · 문서 금액' : ''}
                      </span>
                    </span>
                    {selected ? (
                      <ChevronDown aria-hidden className="size-4 shrink-0 text-gray-500" />
                    ) : (
                      <ChevronRight aria-hidden className="size-4 shrink-0 text-gray-400" />
                    )}
                  </button>

                  <div className="flex shrink-0 items-center gap-0.5">
                    <IconButton
                      variant="ghost"
                      density="table"
                      label="위로"
                      onClick={() => move(index, -1)}
                      disabled={index === 0}
                      icon={<ArrowUp size={14} />}
                    />
                    <IconButton
                      variant="ghost"
                      density="table"
                      label="아래로"
                      onClick={() => move(index, 1)}
                      disabled={index === fields.length - 1}
                      icon={<ArrowDown size={14} />}
                    />
                    <IconButton
                      variant="ghost"
                      density="table"
                      danger
                      label="필드 삭제"
                      onClick={() => removeField(index)}
                      icon={<Trash2 size={14} />}
                    />
                  </div>
                </div>

                {selected && (
                  <div className="border-b border-gray-200 bg-gray-25 p-3 last:border-b-0">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <Field label="필드 이름" required>
                        <Input
                          placeholder="문서에 표시할 이름"
                          value={field.label}
                          onChange={(event) =>
                            setField(index, { ...field, label: event.target.value })
                          }
                        />
                      </Field>
                      <Field label="입력 방식">
                        <Select
                          value={field.type}
                          onChange={(event) =>
                            setField(
                              index,
                              withFieldType(field, event.target.value as FieldType),
                            )
                          }
                        >
                          {FIELD_TYPES.map((type) => (
                            <option key={type} value={type}>
                              {FIELD_TYPE_LABEL[type]}
                            </option>
                          ))}
                        </Select>
                      </Field>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-4">
                      <Checkbox
                        label="필수 입력"
                        checked={field.required ?? false}
                        onChange={(event) =>
                          setField(index, { ...field, required: event.target.checked })
                        }
                      />
                      {canBePrimaryAmount(field.type) && (
                        <Checkbox
                          label="문서 금액으로 사용"
                          title="이 값이 문서 금액이 되어 재무 집계로 이어집니다."
                          checked={field.primaryAmount ?? false}
                          onChange={(event) =>
                            setField(index, { ...field, primaryAmount: event.target.checked })
                          }
                        />
                      )}
                    </div>

                    {hasFieldExtras(field) && (
                      <div className="mt-3 border-t border-gray-200 pt-3">
                        <FieldExtraSettings
                          field={field}
                          onChange={(next) => setField(index, next)}
                        />
                      </div>
                    )}

                    <details className="mt-3 border-t border-gray-200 pt-2">
                      <summary className="cursor-pointer text-caption text-gray-500">
                        시스템 정보
                      </summary>
                      <p className={cn('mt-2', cardText.meta)}>
                        저장 키: <code>{field.key}</code> · 기존 문서의 값과 연결되어 변경할 수 없습니다.
                      </p>
                    </details>
                  </div>
                )}
              </Fragment>
            )
          })}
        </div>
      )}

      <Button type="button" variant="outline" onClick={addField}>
        필드 추가
      </Button>
    </div>
  )
}
