import { DataTable, EmptyState, Spinner, type Column } from '@ynarcher/ui'
import { useExpertRanking, type ExpertRank } from '@/features/hub/hooks'

const columns: Column<ExpertRank>[] = [
  {
    key: 'rank',
    header: '순위',
    align: 'right',
    numeric: true,
    render: () => '',
  },
  { key: 'expert_name', header: '전문가', render: (r) => r.expert_name },
  {
    key: 'avg_score',
    header: '평균 만족도',
    align: 'right',
    numeric: true,
    render: (r) => r.avg_score.toFixed(2),
  },
  {
    key: 'session_count',
    header: '평가 세션',
    align: 'right',
    numeric: true,
    render: (r) => r.session_count,
  },
]

/** 전문가 만족도 랭킹 보드. */
export function RankingPanel() {
  const { data, isLoading } = useExpertRanking()
  if (isLoading) return <Spinner />
  const rows = data ?? []
  if (rows.length === 0) {
    return <EmptyState title="집계된 만족도 평가가 아직 없습니다." description="멘토링 세션 만족도 제출이 누적되면 랭킹이 표시됩니다." />
  }
  // 순위 컬럼을 인덱스로 렌더링
  const ranked: Column<ExpertRank>[] = columns.map((c) =>
    c.key === 'rank'
      ? { ...c, render: (r) => String(rows.indexOf(r) + 1) }
      : c,
  )
  return (
    <DataTable columns={ranked} rows={rows} rowKey={(r) => r.expert_id} numbered={false} standardColumns={false} />
  )
}
