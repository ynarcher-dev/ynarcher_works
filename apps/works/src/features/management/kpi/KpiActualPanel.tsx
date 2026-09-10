import { useEffect, useMemo, useState } from 'react'
import { Badge, Button, Card, EmptyState, Field, Input, Select, Skeleton, useToast } from '@ynarcher/ui'
import { useDepartments } from '@/features/management/orgHooks'
import {
  useKpiActuals,
  useKpiAssignments,
  useKpiPeople,
  useKpiTemplateItems,
  useKpiTemplates,
  useSaveKpiActual,
} from './kpiApi'
import type { KpiActualRevision, KpiAssignment, KpiTemplateItem } from './kpiTypes'

interface Props { versionId: string; orgVersionId: string; editable: boolean }

function ActualRow({ assignment, item, actual, editable }: {
  assignment: KpiAssignment
  item: KpiTemplateItem
  actual?: KpiActualRevision
  editable: boolean
}) {
  const toast = useToast()
  const save = useSaveKpiActual()
  const [numeric, setNumeric] = useState(actual?.actual_value?.toString() ?? '')
  const [grade, setGrade] = useState(actual?.qualitative_value ?? '')
  const [evidence, setEvidence] = useState(actual?.evidence_ref ?? '')
  const unitKeys = useMemo(() => {
    const source = item.rule_params.per_unit
    return Array.isArray(source) ? source.map((row) => String((row as { key?: unknown }).key ?? '')).filter(Boolean) : []
  }, [item.rule_params])
  const [counts, setCounts] = useState<Record<string, number>>(actual?.actual_payload ?? {})

  useEffect(() => {
    setNumeric(actual?.actual_value?.toString() ?? '')
    setGrade(actual?.qualitative_value ?? '')
    setEvidence(actual?.evidence_ref ?? '')
    setCounts(actual?.actual_payload ?? {})
  }, [actual])

  const submit = async () => {
    try {
      await save.mutateAsync({
        assignmentId: assignment.id,
        itemId: item.id,
        actual: item.input_type === 'NUMBER' && numeric !== '' ? Number(numeric) : null,
        qualitative: item.input_type === 'GRADE' ? grade || null : null,
        payload: item.input_type === 'MULTI_COUNT' ? counts : null,
        evidence: evidence.trim() || null,
      })
      toast.show(`${item.metric_name} 실적을 저장했습니다.`, 'success')
    } catch (error) {
      toast.show(error instanceof Error ? error.message : '실적 저장에 실패했습니다.', 'danger')
    }
  }

  return (
    <div className="space-y-3 border-b border-gray-200 py-4 last:border-0">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium text-gray-900">{item.metric_name}</p>
          <p className="mt-0.5 text-caption text-gray-500">{item.criteria_text ?? item.description ?? '별도 인정 기준 없음'}</p>
        </div>
        <Badge tone={actual ? 'success' : 'neutral'}>{actual ? `${actual.computed_score ?? 0}점` : '미입력'}</Badge>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
        {item.input_type === 'NUMBER' && (
          <Field label={`실적${item.unit ? ` (${item.unit})` : ''}`}>
            <Input type="number" value={numeric} disabled={!editable} onChange={(event) => setNumeric(event.target.value)} />
          </Field>
        )}
        {item.input_type === 'GRADE' && (
          <Field label="등급">
            <Select value={grade} disabled={!editable} onChange={(event) => setGrade(event.target.value)}>
              <option value="">선택</option>
              {(Array.isArray(item.rule_params.grades) ? item.rule_params.grades : []).map((row, index) => {
                const value = String((row as { grade?: unknown }).grade ?? '')
                return <option key={`${value}-${index}`} value={value}>{value}</option>
              })}
            </Select>
          </Field>
        )}
        {item.input_type === 'MULTI_COUNT' && (
          <div className="grid grid-cols-2 gap-2 sm:col-span-2">
            {unitKeys.map((key) => <Field key={key} label={`${key} 건수`}><Input type="number" min={0} value={counts[key] ?? 0} disabled={!editable} onChange={(event) => setCounts({ ...counts, [key]: Number(event.target.value) })} /></Field>)}
          </div>
        )}
        <Field label={item.evidence_required ? '증빙 링크·메모 (필수)' : '증빙 링크·메모'}>
          <Input value={evidence} disabled={!editable} onChange={(event) => setEvidence(event.target.value)} />
        </Field>
        {editable && <Button onClick={() => void submit()} disabled={save.isPending || (item.evidence_required && !evidence.trim())}>{save.isPending ? '저장 중…' : '실적 저장'}</Button>}
      </div>
    </div>
  )
}

export function KpiActualPanel({ versionId, orgVersionId, editable }: Props) {
  const { data: assignments = [], isLoading: assignmentLoading } = useKpiAssignments(versionId)
  const { data: templates = [], isLoading: templateLoading } = useKpiTemplates(versionId)
  const { data: departments = [] } = useDepartments(false, orgVersionId)
  const { data: people = [] } = useKpiPeople(orgVersionId)
  const [assignmentId, setAssignmentId] = useState('')
  useEffect(() => {
    if (!assignmentId || !assignments.some((row) => row.id === assignmentId)) setAssignmentId(assignments[0]?.id ?? '')
  }, [assignments, assignmentId])
  const assignment = assignments.find((row) => row.id === assignmentId)
  const template = templates.find((row) => row.id === assignment?.template_id)
  const { data: items = [], isLoading: itemLoading } = useKpiTemplateItems(template?.id)
  const { data: actuals = [], isLoading: actualLoading } = useKpiActuals(assignment?.id)
  const actualByItem = new Map(actuals.map((actual) => [actual.template_item_id, actual]))
  const subjectName = (row: KpiAssignment) => row.subject_type === 'DEPARTMENT'
    ? departments.find((department) => department.id === row.department_id)?.name
    : people.find((person) => person.id === row.user_id)?.name

  if (assignmentLoading || templateLoading) return <Skeleton className="h-72 rounded-radius-lg" />

  return (
    <Card title="KPI 실적 입력" help="실적을 저장할 때마다 개정 이력이 남고 점수가 다시 계산됩니다. 발행된 스냅샷은 구성과 할당을 고정하지만, 마감 전까지 실적 개정은 누적할 수 있습니다.">
      {!assignments.length ? <EmptyState title="할당된 KPI가 없습니다." description="부서·개인 할당을 먼저 완료하세요." /> : (
        <div className="space-y-4">
          <Field label="대상 KPI">
            <Select value={assignmentId} onChange={(event) => setAssignmentId(event.target.value)}>
              {assignments.map((row) => <option key={row.id} value={row.id}>{row.subject_type === 'DEPARTMENT' ? '부서' : '개인'} · {subjectName(row) ?? '알 수 없음'} · {templates.find((templateRow) => templateRow.id === row.template_id)?.name ?? '템플릿'}</option>)}
            </Select>
          </Field>
          {itemLoading || actualLoading ? <Skeleton className="h-48 rounded-radius-md" /> : !template ? <EmptyState title="연결된 템플릿을 찾을 수 없습니다." /> : (
            <div>
              {items.map((item) => <ActualRow key={item.id} assignment={assignment as KpiAssignment} item={item} actual={actualByItem.get(item.id)} editable={editable} />)}
              {!items.length && <EmptyState title="이 템플릿에는 KPI 항목이 없습니다." />}
            </div>
          )}
        </div>
      )}
    </Card>
  )
}
