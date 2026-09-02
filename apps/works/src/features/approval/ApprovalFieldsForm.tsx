import { Field, Input, Select, TextArea, cn } from '@ynarcher/ui'
import { RichTextEditor } from '@/components/RichTextEditor'
import { FieldTableInput } from '@/features/approval/FieldTableInput'
import {
  formatMoney,
  scalarValue,
  tableRows,
  toNumber,
  type FieldValues,
  type FormField,
} from '@/features/approval/fields'

interface ApprovalFieldsFormProps {
  fields: FormField[]
  values: FieldValues
  onChange: (values: FieldValues) => void
}

/** 스칼라 필드 한 칸의 입력 컨트롤. 타입이 곧 입력 방식을 정한다. */
function ScalarInput({
  field,
  value,
  onChange,
}: {
  field: FormField
  value: string
  onChange: (v: string) => void
}) {
  switch (field.type) {
    case 'RICHTEXT':
      return (
        <RichTextEditor value={value} onChange={onChange} placeholder={`${field.label} 입력`} />
      )
    case 'TEXTAREA':
      return <TextArea rows={4} value={value} onChange={(e) => onChange(e.target.value)} />
    case 'SELECT':
      return (
        <Select value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">선택</option>
          {(field.options ?? []).map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </Select>
      )
    case 'DATE':
      return <Input type="date" value={value} onChange={(e) => onChange(e.target.value)} />
    case 'MONEY':
    case 'NUMBER':
      return (
        <Input
          inputMode="numeric"
          className={cn('text-right tabular-nums')}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )
    default:
      return <Input value={value} onChange={(e) => onChange(e.target.value)} />
  }
}

/**
 * 양식 필드 입력 묶음 — 스키마를 받아 그 순서대로 입력 칸을 편다.
 * 화면은 어떤 필드가 있는지 모른다(양식이 정한다). 규격 클래스를 직접 쓰지 않고
 * 폼 한 칸은 `Field`가, 표는 `FieldTableInput`이 소유한다.
 */
export function ApprovalFieldsForm({ fields, values, onChange }: ApprovalFieldsFormProps) {
  const set = (key: string, v: FieldValues[string]) => onChange({ ...values, [key]: v })

  return (
    <div className="space-y-4">
      {fields.map((field) => {
        if (field.type === 'TABLE') {
          return (
            <Field key={field.key} as="div" label={field.label} required={field.required} hint={field.help}>
              <FieldTableInput
                field={field}
                rows={tableRows(values, field.key)}
                onChange={(rows) => set(field.key, rows)}
              />
            </Field>
          )
        }

        // 금액·숫자는 입력한 값이 어떻게 읽히는지 옆에 바로 보인다 — 쉼표를 섞어 적어도
        // 저장되는 수치가 무엇인지 확인하고 넘어갈 수 있다.
        const raw = scalarValue(values, field.key)
        const parsed = field.type === 'MONEY' || field.type === 'NUMBER' ? toNumber(raw) : null
        const hint =
          parsed !== null
            ? field.type === 'MONEY'
              ? formatMoney(parsed)
              : parsed.toLocaleString('ko-KR')
            : field.help

        return (
          <Field
            key={field.key}
            as={field.type === 'RICHTEXT' ? 'div' : 'label'}
            label={field.label}
            required={field.required}
            // 숫자를 적은 동안 이 자리는 설명이 아니라 '이렇게 저장됩니다'의 되읽기다.
            // 되읽기를 호버 뒤로 접으면 확인하려고 띄운 값을 확인할 수 없다.
            hintInline={parsed !== null}
            hint={hint}
          >
            <ScalarInput field={field} value={raw} onChange={(v) => set(field.key, v)} />
          </Field>
        )
      })}
    </div>
  )
}
