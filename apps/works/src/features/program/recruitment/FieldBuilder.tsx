import { Button, Checkbox, Input, Select } from '@ynarcher/ui'
import { ChevronDown, ChevronUp, Plus, RotateCcw, Trash2 } from 'lucide-react'
import {
  FIELD_TYPE_LABEL,
  PRESET_FIELDS,
  type FieldType,
  type FormField,
} from '@/features/program/recruitment/recruitmentHooks'

const FIELD_TYPES = Object.keys(FIELD_TYPE_LABEL) as FieldType[]

/**
 * 신청 항목(신청서 필드) 빌더. 프리셋을 시드로 두고 프로젝트별로
 * 추가/삭제/정렬/필수토글/라벨편집 + select 옵션 · file 제약을 조정한다.
 * 순서는 배열 순서가 곧 sort_order이며 저장 시 재계산한다(recruitmentHooks).
 */
export function FieldBuilder({
  fields,
  onChange,
}: {
  fields: FormField[]
  onChange: (next: FormField[]) => void
}) {
  const patch = (idx: number, part: Partial<FormField>) =>
    onChange(fields.map((f, i) => (i === idx ? { ...f, ...part } : f)))

  const move = (idx: number, dir: -1 | 1) => {
    const j = idx + dir
    const a = fields[idx]
    const b = fields[j]
    if (!a || !b) return
    const next = [...fields]
    next[idx] = b
    next[j] = a
    onChange(next)
  }

  const remove = (idx: number) => onChange(fields.filter((_, i) => i !== idx))

  const add = () =>
    onChange([
      ...fields,
      {
        field_type: 'text',
        label: '',
        is_required: false,
        options: [],
        file_constraints: {},
        sort_order: fields.length,
      },
    ])

  const resetPreset = () => onChange(PRESET_FIELDS.map((f) => ({ ...f })))

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-body font-medium text-gray-800">신청 항목</span>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={resetPreset} type="button">
            <RotateCcw className="mr-1 h-3.5 w-3.5" /> 프리셋
          </Button>
          <Button variant="secondary" size="sm" onClick={add} type="button">
            <Plus className="mr-1 h-3.5 w-3.5" /> 항목 추가
          </Button>
        </div>
      </div>

      {fields.length === 0 && (
        <p className="rounded-radius-sm border border-gray-200 bg-gray-25 px-3 py-2 text-caption text-gray-500">
          신청 항목이 없습니다. 프리셋을 불러오거나 항목을 추가하세요.
        </p>
      )}

      <ul className="space-y-2">
        {fields.map((f, idx) => (
          <li
            key={f.id ?? `new-${idx}`}
            className="rounded-radius-md border border-gray-200 bg-white p-2.5"
          >
            <div className="flex items-start gap-2">
              <div className="flex flex-col pt-1">
                <button
                  type="button"
                  aria-label="위로"
                  onClick={() => move(idx, -1)}
                  className="text-gray-400 hover:text-gray-700 disabled:opacity-30"
                  disabled={idx === 0}
                >
                  <ChevronUp className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  aria-label="아래로"
                  onClick={() => move(idx, 1)}
                  className="text-gray-400 hover:text-gray-700 disabled:opacity-30"
                  disabled={idx === fields.length - 1}
                >
                  <ChevronDown className="h-4 w-4" />
                </button>
              </div>

              <div className="grid flex-1 grid-cols-1 gap-2 sm:grid-cols-[1fr_9rem]">
                <Input
                  aria-label="항목 이름"
                  placeholder="항목 이름 (예: 기업명)"
                  value={f.label}
                  onChange={(e) => patch(idx, { label: e.target.value })}
                />
                <Select
                  aria-label="항목 유형"
                  value={f.field_type}
                  onChange={(e) => patch(idx, { field_type: e.target.value as FieldType })}
                >
                  {FIELD_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {FIELD_TYPE_LABEL[t]}
                    </option>
                  ))}
                </Select>

                {f.field_type === 'select' && (
                  <Input
                    className="sm:col-span-2"
                    aria-label="선택지"
                    placeholder="선택지(쉼표로 구분): 예) SaaS, 제조, 바이오"
                    value={f.options.join(', ')}
                    onChange={(e) =>
                      patch(idx, {
                        options: e.target.value
                          .split(',')
                          .map((s) => s.trim())
                          .filter(Boolean),
                      })
                    }
                  />
                )}

                {f.field_type === 'file' && (
                  <div className="grid grid-cols-[1fr_7rem] gap-2 sm:col-span-2">
                    <Input
                      aria-label="허용 확장자"
                      placeholder="허용 형식(예: .pdf,.ppt)"
                      value={f.file_constraints.accept ?? ''}
                      onChange={(e) =>
                        patch(idx, {
                          file_constraints: { ...f.file_constraints, accept: e.target.value },
                        })
                      }
                    />
                    <Input
                      aria-label="최대 용량 MB"
                      type="number"
                      placeholder="MB"
                      value={f.file_constraints.max_mb ?? ''}
                      onChange={(e) =>
                        patch(idx, {
                          file_constraints: {
                            ...f.file_constraints,
                            max_mb: e.target.value ? Number(e.target.value) : undefined,
                          },
                        })
                      }
                    />
                  </div>
                )}
              </div>

              <div className="flex flex-col items-end gap-1.5 pt-1">
                <label className="flex cursor-pointer items-center gap-1 text-caption text-gray-600">
                  <Checkbox
                    checked={f.is_required}
                    onChange={() => patch(idx, { is_required: !f.is_required })}
                  />
                  필수
                </label>
                <button
                  type="button"
                  aria-label="항목 삭제"
                  onClick={() => remove(idx)}
                  className="text-gray-400 hover:text-danger"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
