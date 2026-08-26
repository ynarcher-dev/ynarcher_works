import {
  Card,
  Checkbox,
  DataTable,
  Field,
  Input,
  Select,
  Spinner,
  type Column,
} from '@ynarcher/ui'
import { useMemo, useState } from 'react'
import {
  groupFormsByCategory,
  useApprovalAggregateSource,
  useApprovalForms,
} from '@/features/approval/approvalApi'
import {
  aggregate,
  inPeriod,
  totalOf,
  type AggregateDoc,
  type AggregateRow,
  type GroupBy,
} from '@/features/approval/aggregate'
import { formatMoney, parseFields, primaryAmountLabel } from '@/features/approval/fields'

const GROUP_OPTIONS: { key: GroupBy; label: string }[] = [
  { key: 'item', label: '항목별' },
  { key: 'document', label: '문서별' },
  { key: 'month', label: '월별' },
]

/**
 * 결재 금액 집계 — 이 서비스를 다시 만든 이유가 화면으로 드러나는 자리.
 *
 * 예전에는 지출결의서를 한 건씩 열어 프로젝트별 금액을 엑셀에 옮겨 적었다. 양식이 값의
 * 타입을 알고 있으므로 그 일이 여기서 끝난다 — 표 필드의 행을 문서 경계 너머로 펴서
 * 항목별로 더하고, 기간·상태로 좁힌다.
 *
 * 기본은 **승인 완료분만** 센다. 진행 중인 문서까지 더하면 아직 확정되지 않은 돈이 실지출로
 * 읽히고, 재무 대시보드가 보는 숫자(승인 완료 금액)와도 어긋난다.
 *
 * 자리는 MANAGEMENT(경영지원)다 — 결재를 하는 일은 OFFICE의 전사 업무지만, 결재된 돈을
 * 모아 보는 일은 재무 관리와 같은 축이고 실제로 그 숫자를 쓰는 사람도 경영지원이다.
 * 페이지 제목은 ManagementPage가 그리므로 이 패널은 제목을 갖지 않는다.
 */
export function ApprovalAggregatePanel() {
  const { data: forms, isLoading: formsLoading } = useApprovalForms()
  const [formId, setFormId] = useState('')
  const [groupBy, setGroupBy] = useState<GroupBy>('item')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [approvedOnly, setApprovedOnly] = useState(true)

  // 대표 금액이 지정된 양식만 집계할 수 있다(무엇을 더할지 정해져 있지 않으면 셀 것이 없다).
  const countableForms = useMemo(
    () =>
      (forms ?? []).filter((f) => primaryAmountLabel(parseFields(f.current_version?.fields))),
    [forms],
  )
  const selectedForm = countableForms.find((f) => f.id === formId) ?? null
  const { data: source, isLoading } = useApprovalAggregateSource(formId || undefined)

  const docs = useMemo<AggregateDoc[]>(() => {
    return (source ?? [])
      .filter((r) => (approvedOnly ? r.status === 'APPROVED' : r.status !== 'DRAFT'))
      .filter((r) => inPeriod(r.created_at, from, to))
      .map((r) => ({
        id: r.id,
        title: r.title,
        docNo: r.doc_no,
        createdAt: r.created_at,
        departmentId: r.department_id,
        amount: r.amount,
        // 문서마다 자기 기안 시점의 스키마로 값을 읽는다 — 양식을 고쳐도 과거 문서가 어긋나지 않는다.
        fields: parseFields(r.version?.fields),
        values: r.field_values ?? {},
      }))
  }, [source, approvedOnly, from, to])

  const rows = useMemo(() => aggregate(docs, groupBy), [docs, groupBy])
  const total = totalOf(rows)

  const columns: Column<AggregateRow>[] = [
    {
      key: 'label',
      header: groupBy === 'item' ? '항목' : groupBy === 'document' ? '문서' : '월',
      type: 'name',
      primary: true,
      render: (r) => r.label,
    },
    {
      key: 'count',
      header: groupBy === 'document' ? '문서' : '건수',
      type: 'count',
      render: (r) => r.count,
    },
    { key: 'total', header: '금액', type: 'money', render: (r) => formatMoney(r.total) },
    {
      key: 'share',
      header: '비중',
      type: 'count',
      render: (r) => (total > 0 ? `${Math.round((r.total / total) * 100)}%` : '-'),
    },
  ]

  if (formsLoading && !forms) return <Spinner />

  return (
    <div className="space-y-5">
      <Card title="집계 조건">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Field label="문서 양식">
            {/* 분류로 묶어 편다 — 양식이 늘어날수록 한 줄짜리 목록은 훑기 어려워진다. */}
            <Select value={formId} onChange={(e) => setFormId(e.target.value)}>
              <option value="">양식 선택</option>
              {groupFormsByCategory(countableForms).map((g) => (
                <optgroup key={g.category} label={g.category}>
                  {g.forms.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </Select>
          </Field>
          <Field label="묶는 기준">
            <Select value={groupBy} onChange={(e) => setGroupBy(e.target.value as GroupBy)}>
              {GROUP_OPTIONS.map((g) => (
                <option key={g.key} value={g.key}>
                  {g.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="기안일(시작)">
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label="기안일(종료)">
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </Field>
          <Field as="div" label="집계 범위">
            <Checkbox
              label="승인 완료분만"
              checked={approvedOnly}
              onChange={(e) => setApprovedOnly(e.target.checked)}
            />
          </Field>
        </div>
      </Card>

      {!formId ? (
        <Card title="집계 결과">
          <p className="py-8 text-center text-body text-gray-500">
            {countableForms.length === 0
              ? '집계할 수 있는 양식이 없습니다. ADMIN 결재 양식 관리에서 금액 필드에 대표 금액을 지정하세요.'
              : '문서 양식을 고르면 금액을 모아 보여줍니다.'}
          </p>
        </Card>
      ) : isLoading && !source ? (
        <Spinner />
      ) : (
        <Card
          title={`${selectedForm?.name ?? '집계'} — ${formatMoney(total)}`}
          subtitle={`문서 ${docs.length}건 · 기준 ${primaryAmountLabel(parseFields(selectedForm?.current_version?.fields)) ?? '-'}`}
        >
          <DataTable
            columns={columns}
            rows={rows}
            rowKey={(r) => r.key}
            selectable={false}
            numbered={false}
            standardColumns={false}
            emptyText="집계할 문서가 없습니다."
          />
        </Card>
      )}
    </div>
  )
}
