import { useMemo, useState } from 'react'
import { Target } from 'lucide-react'
import { Badge, Card, EmptyState, Skeleton, SummaryTile, type SummaryTileTone } from '@ynarcher/ui'
import { useMyKpiDashboard } from '@/features/management/kpi/kpiApi'
import type { KpiDashboardRow, KpiScope } from '@/features/management/kpi/kpiTypes'
import { KpiDetailModal } from './KpiDetailModal'
import { actualLabel, targetLabel } from './kpiDisplay'

const KPI_TONES: SummaryTileTone[] = ['blue', 'purple', 'cyan', 'mint', 'amber', 'peach', 'rose', 'lime']

function KpiScopeSection({ scope, rows, onSelect }: { scope: KpiScope; rows: KpiDashboardRow[]; onSelect: (row: KpiDashboardRow) => void }) {
  const first = rows[0]
  const completed = rows.filter((row) => row.computed_score != null).length
  const title = scope === 'PERSON' ? '나의 KPI' : '소속 부서 KPI'

  return (
    <section aria-labelledby={`kpi-${scope.toLowerCase()}-title`}>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <h3 id={`kpi-${scope.toLowerCase()}-title`} className="font-semibold text-gray-900">{title}</h3>
            <Badge tone={scope === 'PERSON' ? 'info' : 'neutral'}>{rows.length}</Badge>
          </div>
          {first && <p className="mt-1 text-caption text-gray-500">{first.subject_name} · {first.template_name}</p>}
        </div>
        {rows.length > 0 && <p className="text-caption text-gray-500">{completed}/{rows.length} 실적 입력</p>}
      </div>

      {!rows.length ? (
        <div className="rounded-radius-lg border border-dashed border-gray-200 bg-gray-50/60 py-3">
          <EmptyState
            title={scope === 'PERSON' ? '할당된 개인 KPI가 없습니다.' : '현재 소속 부서 KPI가 없습니다.'}
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((row, index) => (
            <SummaryTile
              key={`${row.assignment_id}-${row.item_id}`}
              eyebrow={scope === 'PERSON' ? '개인 KPI' : '부서 KPI'}
              title={row.metric_name}
              value={row.computed_score == null ? '미입력' : row.computed_score}
              unit={row.computed_score == null ? undefined : `/${row.max_score ?? 0}점`}
              tone={KPI_TONES[index % KPI_TONES.length]}
              icon={<Target aria-hidden className="size-[18px]" strokeWidth={1.8} />}
              metrics={[
                { label: '실적', value: actualLabel(row) },
                { label: '목표', value: targetLabel(row) },
              ]}
              onClick={() => onSelect(row)}
              className="min-h-40"
            />
          ))}
        </div>
      )}

      {first && <p className="mt-3 text-caption text-gray-500">{first.org_version_label} · {first.kpi_version_label}</p>}
    </section>
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
  return <>
    <Card title="KPI 현황" help="각 KPI 카드를 누르면 설명, 인정 기준, 점수 구간과 현재 산정 근거를 확인할 수 있습니다.">
      <div className="space-y-6 divide-y divide-gray-200 [&>section+section]:pt-6">
        <KpiScopeSection scope="PERSON" rows={byScope.PERSON} onSelect={setSelected} />
        <KpiScopeSection scope="DEPARTMENT" rows={byScope.DEPARTMENT} onSelect={setSelected} />
      </div>
    </Card>
    <KpiDetailModal row={selected} onClose={() => setSelected(null)} />
  </>
}
