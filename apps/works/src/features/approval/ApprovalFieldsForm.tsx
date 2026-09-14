import { Field, Input, Select, TextArea, cn } from '@ynarcher/ui'
import { RichTextEditor } from '@/components/RichTextEditor'
import { BudgetTreeInput } from '@/features/approval/BudgetTreeInput'
import { FieldTableInput } from '@/features/approval/FieldTableInput'
import {
  HtmlTemplateField,
  type HtmlTemplateContext,
} from '@/features/approval/HtmlTemplateField'
import {
  budgetValue,
  formatMoney,
  htmlTemplateValue,
  isNumericColumn,
  planProfit,
  planValue,
  scalarValue,
  tableRows,
  toNumber,
  type FieldValues,
  type FormField,
  type ProfitPlanValue,
} from '@/features/approval/fields'

interface ApprovalFieldsFormProps {
  fields: FormField[]
  values: FieldValues
  onChange: (values: FieldValues) => void
  documentContext?: HtmlTemplateContext
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
 * 사업 수지 계획 입력 — 예상 매출과 예상 예산 두 칸, 그리고 **계산되어 따라오는 이익**.
 *
 * 이익 칸이 읽기 전용인 것은 화면의 친절이 아니라 값의 성질이다: 이익은 적는 것이 아니라
 * 매출 − 예산이다. 적을 수 있게 두면 세 숫자가 서로 어긋난 문서가 결재를 통과하고, 나중에
 * 실적과 견줄 때 무엇과 견준 것인지 말할 수 없게 된다.
 */
function ProfitPlanInput({
  value,
  onChange,
}: {
  value: ProfitPlanValue
  onChange: (next: ProfitPlanValue) => void
}) {
  const { revenue, budget, profit } = planProfit(value)
  const loss = profit !== null && profit < 0

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <Field as="label" label="예상 매출" hintInline hint={revenue !== null ? formatMoney(revenue) : undefined}>
        <Input
          inputMode="numeric"
          className="text-right tabular-nums"
          value={value.revenue}
          onChange={(e) => onChange({ ...value, revenue: e.target.value })}
        />
      </Field>
      <Field as="label" label="예상 예산" hintInline hint={budget !== null ? formatMoney(budget) : undefined}>
        <Input
          inputMode="numeric"
          className="text-right tabular-nums"
          value={value.budget}
          onChange={(e) => onChange({ ...value, budget: e.target.value })}
        />
      </Field>
      {/* 적는 칸이 아니라 따라오는 값이라 입력 상자를 세우지 않는다 — 상자를 세우면
          손댈 수 있는 것처럼 보이고, 손댈 수 없다는 사실을 회색으로만 말하게 된다. */}
      <Field as="div" label="예상 이익" hint="예상 매출에서 예상 예산을 뺀 값입니다.">
        <p
          className={cn(
            'flex h-9 items-center justify-end tabular-nums',
            loss ? 'font-semibold text-danger' : 'text-gray-900',
          )}
        >
          {profit === null ? '-' : formatMoney(profit)}
        </p>
      </Field>
    </div>
  )
}

/**
 * 양식 필드 입력 묶음 — 스키마를 받아 그 순서대로 입력 칸을 편다.
 * 화면은 어떤 필드가 있는지 모른다(양식이 정한다). 규격 클래스를 직접 쓰지 않고
 * 폼 한 칸은 `Field`가, 표는 `FieldTableInput`이 소유한다.
 */
export function ApprovalFieldsForm({
  fields,
  values,
  onChange,
  documentContext = { title: '', docNo: null },
}: ApprovalFieldsFormProps) {
  const set = (key: string, v: FieldValues[string]) => onChange({ ...values, [key]: v })

  return (
    <div className="space-y-4">
      {fields.map((field) => {
        if (field.type === 'HTML_TEMPLATE') {
          return (
            <HtmlTemplateField
              key={field.key}
              assets={field.htmlAssets}
              context={documentContext}
              value={htmlTemplateValue(values, field.key)}
              onChange={(next) => set(field.key, next)}
            />
          )
        }

        if (field.type === 'BUDGET_TREE') {
          return (
            <Field
              key={field.key}
              as="div"
              label={field.label}
              required={field.required}
              hint={field.help}
            >
              <BudgetTreeInput
                field={field}
                value={budgetValue(values, field.key)}
                onChange={(next) => set(field.key, next)}
              />
            </Field>
          )
        }

        if (field.type === 'PROFIT_PLAN') {
          return (
            <Field
              key={field.key}
              as="div"
              label={field.label}
              required={field.required}
              hint={field.help}
            >
              <ProfitPlanInput
                value={planValue(values, field.key)}
                onChange={(next) => set(field.key, next)}
              />
            </Field>
          )
        }

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
        const parsed = isNumericColumn(field.type) ? toNumber(raw) : null
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
