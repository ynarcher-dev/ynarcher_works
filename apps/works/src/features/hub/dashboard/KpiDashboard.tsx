import { useMemo, useState } from 'react'
import { Badge, Card, EmptyState, Skeleton } from '@ynarcher/ui'
import { useMyKpiDashboard } from '@/features/management/kpi/kpiApi'
import type { KpiDashboardRow, KpiScope } from '@/features/management/kpi/kpiTypes'
import { KpiDetailModal } from './KpiDetailModal'
import { actualLabel, targetLabel } from './kpiDisplay'

function KpiScopeCard({ scope, rows, onSelect }: { scope: KpiScope; rows: KpiDashboardRow[]; onSelect: (row: KpiDashboardRow) => void }) {
  const first = rows[0]
  const completed = rows.filter((row) => row.computed_score != null).length
  const score = first?.total_score ?? rows.reduce((sum, row) => sum + (row.computed_score ?? 0), 0)
  const maxScore = rows.reduce((sum, row) => sum + (row.max_score ?? 0), 0)
  const percentage = rows.length ? Math.round(completed / rows.length * 100) : 0
  return (
    <Card
      title={scope === 'PERSON' ? '나의 KPI' : '소속 부서 KPI'}
      count={rows.length}
      subtitle={first ? `${first.subject_name} · ${first.template_name}` : undefined}
      help="항목을 누르면 설명, 인정 기준, 점수 구간과 현재 산정 근거를 확인할 수 있습니다."
    >
      {!rows.length ? <EmptyState title={scope === 'PERSON' ? '할당된 개인 KPI가 없습니다.' : '현재 소속 부서 KPI가 없습니다.'} /> : <div className="space-y-4">
        <div className="rounded-radius-md bg-gray-50 p-3">
          <div className="flex items-end justify-between gap-3"><div><p className="text-caption text-gray-500">현재 점수</p><p className="text-title font-semibold tabular-nums text-gray-900">{score}점{maxScore ? <span className="ml-1 text-body font-normal text-gray-500">/ {maxScore}점</span> : null}</p></div><Badge tone={percentage === 100 ? 'success' : 'info'}>{completed}/{rows.length} 입력</Badge></div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-gray-200"><div className="h-full rounded-full bg-brand transition-all" style={{ width: `${percentage}%` }} /></div>
        </div>
        <div className="divide-y divide-gray-200 rounded-radius-md border border-gray-200">
          {rows.map((row) => <button key={`${row.assignment_id}-${row.item_id}`} type="button" onClick={() => onSelect(row)} className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3 py-3 text-left hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">
            <div className="min-w-0"><p className="truncate font-medium text-gray-900">{row.metric_name}</p><p className="mt-0.5 truncate text-caption text-gray-500">실적 {actualLabel(row)} · 목표 {targetLabel(row)}</p></div>
            <Badge tone={row.computed_score == null ? 'neutral' : 'success'}>{row.computed_score == null ? '미입력' : `${row.computed_score}점`}</Badge>
          </button>)}
        </div>
        <p className="text-caption text-gray-500">{first?.org_version_label} · {first?.kpi_version_label}</p>
      </div>}
    </Card>
  )
}

export function KpiDashboard() {
  const { data = [], isLoading, isError } = useMyKpiDashboard()
  const [selected, setSelected] = useState<KpiDashboardRow | null>(null)
  const byScope = useMemo(() => ({
    PERSON: data.filter((row) => row.scope_type === 'PERSON'),
    DEPARTMENT: data.filter((row) => row.scope_type === 'DEPARTMENT'),
  }), [data])
  if (isLoading) return <Skeleton className="h-96 rounded-radius-lg" />
  if (isError) return <Card><EmptyState title="KPI 현황을 불러오지 못했습니다." description="잠시 후 다시 시도하세요." /></Card>
  return <div className="space-y-4">
    <KpiScopeCard scope="PERSON" rows={byScope.PERSON} onSelect={setSelected} />
    <KpiScopeCard scope="DEPARTMENT" rows={byScope.DEPARTMENT} onSelect={setSelected} />
    <KpiDetailModal row={selected} onClose={() => setSelected(null)} />
  </div>
}
