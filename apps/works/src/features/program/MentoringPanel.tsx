import { Badge, DataTable, Spinner, type Column } from '@ynarcher/ui'
import {
  useMentoringRelationships,
  type MentoringRelationship,
} from '@/features/program/hooks'

const statusTone: Record<string, 'success' | 'warning' | 'neutral'> = {
  ACTIVE: 'success',
  PAUSED: 'warning',
  ENDED: 'neutral',
}

const columns: Column<MentoringRelationship>[] = [
  {
    key: 'startup_id',
    header: '스타트업',
    render: (r) => (r.startup_id ? r.startup_id.slice(0, 8) : '-'),
  },
  {
    key: 'mentor_participant_id',
    header: '멘토',
    render: (r) =>
      r.mentor_participant_id ? r.mentor_participant_id.slice(0, 8) : '-',
  },
  {
    key: 'status',
    header: '상태',
    render: (r) => (
      <Badge tone={statusTone[r.status] ?? 'neutral'}>{r.status}</Badge>
    ),
  },
]

/** N:N 멘토링 관계 보드. 회차/상담일지·양방향 평가는 각 관계 상세에서 확장. (7-8) */
export function MentoringPanel({ moduleId }: { moduleId: string }) {
  const { data, isLoading } = useMentoringRelationships(moduleId)
  if (isLoading) return <Spinner />

  return (
    <DataTable
      columns={columns}
      rows={data ?? []}
      rowKey={(r) => r.id}
      emptyText="멘토링 관계가 없습니다. (MENTORING 모듈 활성화 + 매칭 후 표시)"
    />
  )
}
