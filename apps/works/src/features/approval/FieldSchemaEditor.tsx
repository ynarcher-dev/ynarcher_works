import { Button, Checkbox, IconButton, Input, Select, TextArea, cardText, cn } from '@ynarcher/ui'
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import { DEFAULT_BUDGET_LEVELS } from '@/features/approval/budget'
import { FieldColumnRow } from '@/features/approval/FieldColumnRow'
import {
  FIELD_TYPE_LABEL,
  canBePrimaryAmount,
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
                      : // 예산표의 기본 열은 기획서가 정한 넷이다(수량·단가·금액·비고).
                        // 항목 이름 열은 따로 정의하지 않는다 — 층을 이루는 왼쪽 칸이
                        // 곧 항목이라 열로 두면 같은 것이 두 번 서게 된다.
                        type === 'BUDGET_TREE'
                        ? (field.columns ?? [
                            { key: 'qty', label: '수량', type: 'NUMBER' },
                            { key: 'unitPrice', label: '단가', type: 'MONEY' },
                            { key: 'amount', label: '금액', type: 'MONEY', primaryAmount: true },
                            { key: 'note', label: '비고', type: 'TEXT', wide: true },
                          ])
                        : undefined,
                  levels:
                    type === 'BUDGET_TREE'
                      ? (field.levels ?? DEFAULT_BUDGET_LEVELS)
                      : undefined,
                  defaultValue: type === 'RICHTEXT' ? field.defaultValue : undefined,
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

          {/* 본문 기본 문구 — 새 문서가 들고 시작하는 틀(`1. 행사명 : …`).
              옛 결재에서 담당자가 매번 손으로 적던 뼈대라, 양식이 한 번 갖고 있으면 된다. */}
          {field.type === 'RICHTEXT' && (
            <div className="space-y-1 border-t border-gray-100 pt-2">
              <p className={cardText.meta}>기본 문구 (새 문서가 이 내용으로 시작합니다)</p>
              <TextArea
                rows={3}
                placeholder={'1. 행사명 : \n2. 행사일자 : '}
                value={field.defaultValue ?? ''}
                onChange={(e) => setField(index, { ...field, defaultValue: e.target.value })}
              />
            </div>
          )}

          {/* 층 이름은 **기본값**만 양식이 갖는다 — 사업마다 층 이름과 층 수가 달라
              (대분류·중분류 / 세목·비목·세세목) 못 박으면 그 목록에 없는 사업은 예산을
              적을 수 없다. 문서를 쓰면서 고칠 수 있고, 최종 값은 문서가 갖는다. */}
          {field.type === 'BUDGET_TREE' && (
            <div className="space-y-1 border-t border-gray-100 pt-2">
              <p className={cardText.meta}>층 이름 기본값 (쉼표로 구분, 위에서 아래 순서)</p>
              <Input
                density="table"
                placeholder="세목, 비목, 세세목"
                value={(field.levels ?? []).join(', ')}
                onChange={(e) =>
                  setField(index, {
                    ...field,
                    levels: e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
                  })
                }
              />
            </div>
          )}

          {(field.type === 'TABLE' || field.type === 'BUDGET_TREE') && (
            <div className="space-y-2 border-t border-gray-100 pt-2">
              <p className={cardText.meta}>
                {field.type === 'BUDGET_TREE' ? '예산표의 숫자 열' : '표의 열'}
              </p>
              {(field.columns ?? []).map((c, ci) => (
                <FieldColumnRow
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
