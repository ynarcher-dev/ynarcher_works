import { useEffect, useState } from 'react'
import { Button, Checkbox, Field, Input, Modal, Select, TextArea } from '@ynarcher/ui'
import { KpiRuleEditor } from './KpiRuleEditor'
import {
  emptyRuleParams,
  type KpiRuleType,
  type KpiTargetMode,
  type KpiTemplateItem,
} from './kpiTypes'

interface Props {
  open: boolean
  templateId: string
  item?: KpiTemplateItem | null
  nextOrder: number
  busy?: boolean
  onClose: () => void
  onSave: (values: Omit<KpiTemplateItem, 'id'>) => void
}

interface FormState {
  section: string
  name: string
  description: string
  criteria: string
  unit: string
  targetMode: KpiTargetMode
  ruleType: KpiRuleType
  ruleParams: Record<string, unknown>
  defaultTarget: string
  maxScore: string
  evidenceRequired: boolean
}

const initial = (item?: KpiTemplateItem | null): FormState => ({
  section: item?.section_label ?? '기본',
  name: item?.metric_name ?? '',
  description: item?.description ?? '',
  criteria: item?.criteria_text ?? '',
  unit: item?.unit ?? '',
  targetMode: item?.target_mode ?? 'ABSOLUTE',
  ruleType: item?.rule_type ?? 'BAND',
  ruleParams: item?.rule_params ?? emptyRuleParams('BAND'),
  defaultTarget: item?.default_target?.toString() ?? '',
  maxScore: item?.max_score?.toString() ?? '',
  evidenceRequired: item?.evidence_required ?? true,
})

export function KpiItemModal({ open, templateId, item, nextOrder, busy, onClose, onSave }: Props) {
  const [form, setForm] = useState<FormState>(() => initial(item))
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { if (open) { setForm(initial(item)); setError(null) } }, [open, item])

  const submit = () => {
    if (!form.name.trim()) return setError('지표명을 입력하세요.')
    const target = form.defaultTarget === '' ? null : Number(form.defaultTarget)
    if (form.targetMode === 'TARGET_RATE' && (!target || target <= 0)) {
      return setError('목표 대비 KPI는 0보다 큰 기본 목표가 필요합니다.')
    }
    onSave({
      template_id: templateId,
      section_label: form.section.trim() || '기본',
      metric_code: item?.metric_code ?? `KPI_${Date.now()}`,
      metric_name: form.name.trim(),
      description: form.description.trim() || null,
      criteria_text: form.criteria.trim() || null,
      unit: form.unit.trim() || null,
      input_type: form.ruleType === 'GRADE_MAP' ? 'GRADE' : form.ruleType === 'PER_UNIT_CAP' ? 'MULTI_COUNT' : 'NUMBER',
      target_mode: form.ruleType === 'GRADE_MAP' || form.ruleType === 'PER_UNIT_CAP' ? 'NONE' : form.targetMode,
      rule_type: form.ruleType,
      rule_params: form.ruleParams,
      default_target: target,
      max_score: form.maxScore === '' ? null : Number(form.maxScore),
      evidence_required: form.evidenceRequired,
      sort_order: item?.sort_order ?? nextOrder,
    })
  }

  return (
    <Modal open={open} onClose={onClose} title={item ? 'KPI 항목 수정' : 'KPI 항목 추가'} size="xl" dismissible={false}
      footer={<><Button variant="secondary" onClick={onClose}>취소</Button><Button onClick={submit} disabled={busy}>{busy ? '저장 중…' : '저장'}</Button></>}>
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="섹션" required><Input value={form.section} onChange={(e) => setForm({ ...form, section: e.target.value })} /></Field>
          <Field label="지표명" required><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
        </div>
        <Field label="설명" hint="이 KPI가 무엇을 측정하고 왜 필요한지 작성합니다.">
          <TextArea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </Field>
        <Field label="인정 기준" hint="집계 범위, 포함·제외 조건, 산정 시점과 증빙 요건을 작성합니다.">
          <TextArea rows={4} value={form.criteria} onChange={(e) => setForm({ ...form, criteria: e.target.value })} />
        </Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="단위"><Input value={form.unit} placeholder="%, 억원, 건" onChange={(e) => setForm({ ...form, unit: e.target.value })} /></Field>
          <Field label="점수 방식" required>
            <Select value={form.ruleType} onChange={(e) => {
              const ruleType = e.target.value as KpiRuleType
              setForm({ ...form, ruleType, ruleParams: emptyRuleParams(ruleType) })
            }}>
              <option value="BAND">구간형</option><option value="PER_UNIT_CAP">건당 합산형</option><option value="GRADE_MAP">등급형</option>
            </Select>
          </Field>
          {form.ruleType === 'BAND' && <Field label="값 계산" required>
            <Select value={form.targetMode} onChange={(e) => setForm({ ...form, targetMode: e.target.value as KpiTargetMode })}>
              <option value="ABSOLUTE">절대값</option><option value="TARGET_RATE">목표 대비 달성률</option>
            </Select>
          </Field>}
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {form.ruleType === 'BAND' && form.targetMode === 'TARGET_RATE' && <Field label="기본 목표" required><Input type="number" value={form.defaultTarget} onChange={(e) => setForm({ ...form, defaultTarget: e.target.value })} /></Field>}
          <Field label="최대 배점"><Input type="number" value={form.maxScore} onChange={(e) => setForm({ ...form, maxScore: e.target.value })} /></Field>
        </div>
        <Field label="점수 기준" required as="div">
          <KpiRuleEditor type={form.ruleType} value={form.ruleParams} onChange={(ruleParams) => setForm({ ...form, ruleParams })} />
        </Field>
        <Checkbox label="실적 확정 시 증빙 필수" checked={form.evidenceRequired} onChange={(e) => setForm({ ...form, evidenceRequired: e.target.checked })} />
        {error && <p className="text-caption text-danger">{error}</p>}
      </div>
    </Modal>
  )
}
