import { Badge, DataTable, Spinner, type Column } from '@ynarcher/ui'
import { useKpis, type Kpi } from '@/features/management/hooks'

/** KPI 관리: 부서별 KPI 달성 현황(실적/목표 대비 달성률). */
export function KpiPanel() {
  const { data: kpis, isLoading } = useKpis()

  const columns: Column<Kpi>[] = [
    { key: 'metric_name', header: '지표', render: (r) => r.metric_name },
    { key: 'period', header: '기간', render: (r) => r.period ?? '-' },
    {
      key: 'actual',
      header: '실적/목표',
      align: 'right',
      numeric: true,
      render: (r) =>
        `${Number(r.actual_value ?? 0).toLocaleString()} / ${Number(r.target_value ?? 0).toLocaleString()}`,
    },
    {
      key: 'rate',
      header: '달성률',
      align: 'right',
      render: (r) => {
        const rate =
          r.target_value && Number(r.target_value) > 0
            ? Math.round((Number(r.actual_value ?? 0) / Number(r.target_value)) * 100)
            : 0
        return (
          <Badge tone={rate >= 100 ? 'success' : rate >= 70 ? 'warning' : 'neutral'}>
            {rate}%
          </Badge>
        )
      },
    },
  ]

  if (isLoading) return <Spinner />

  return (
    <DataTable
      columns={columns}
      rows={kpis ?? []}
      rowKey={(r) => r.id}
      emptyText="등록된 KPI가 없습니다."
    />
  )
}
