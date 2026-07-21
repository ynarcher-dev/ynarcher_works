import { Badge, DataTable, Spinner, type Column } from '@ynarcher/ui'
import { useFormResults, type FormResult } from '@/features/program/evaluationHooks'

const columns: Column<FormResult>[] = [
  {
    key: 'target',
    header: '평가 대상',
    render: (r) => (
      <span className="inline-flex items-center gap-2">
        <Badge tone="neutral">{r.target_type}</Badge>
        <span className="text-gray-600">
          {r.target_ref.slice(0, 8)}
        </span>
      </span>
    ),
  },
  {
    key: 'weighted_total',
    header: '가중 총점',
    align: 'right',
    numeric: true,
    render: (r) => Number(r.weighted_total).toFixed(2),
  },
  {
    key: 'evaluator_count',
    header: '평가자',
    align: 'right',
    numeric: true,
    render: (r) => r.evaluator_count,
  },
  {
    key: 'avg',
    header: '평가자 평균',
    align: 'right',
    numeric: true,
    render: (r) =>
      r.evaluator_count > 0
        ? (Number(r.weighted_total) / r.evaluator_count).toFixed(2)
        : '-',
  },
]

/** 평가 집계 결과(가중 총점 내림차순). */
export function ResultsTable({ formId }: { formId: string }) {
  const { data, isLoading } = useFormResults(formId)
  if (isLoading) return <Spinner density="table" />
  return (
    <div className="space-y-2">
      <h3 className="text-title-sm font-medium text-gray-900">집계 결과</h3>
      <DataTable
        columns={columns}
        rows={data ?? []}
        rowKey={(r) => r.target_id}
        emptyText="평가 대상이 없거나 제출된 평가가 없습니다."
      />
    </div>
  )
}
