import { Badge, DataTable, Spinner, type Column } from '@ynarcher/ui'
import { useParticipants, type Participant } from '@/features/ac/hooks'
import { PARTICIPANT_ROLES } from '@/features/ac/config'

const columns: Column<Participant>[] = [
  { key: 'role', header: '역할', render: (r) => <Badge tone="info">{r.role}</Badge> },
  { key: 'status', header: '상태', render: (r) => r.status },
  { key: 'user_id', header: '연결 계정', render: (r) => (r.user_id ? '연결됨' : '미연결') },
]

/** 참가자 풀 및 역할 요약. (7-3 — CSV 대량 업로드/매직링크 초대는 후속 확장) */
export function ParticipantPool({ programId }: { programId: string }) {
  const { data, isLoading } = useParticipants(programId)
  if (isLoading) return <Spinner />
  const rows = data ?? []

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {PARTICIPANT_ROLES.map((role) => {
          const count = rows.filter((r) => r.role === role).length
          return (
            <div
              key={role}
              className="rounded border border-gray-200 bg-white px-3 py-1.5 text-caption"
            >
              <span className="text-gray-500">{role}</span>{' '}
              <span className="font-medium tabular-nums text-gray-900">{count}</span>
            </div>
          )
        })}
      </div>
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        emptyText="참가자가 없습니다. (매직링크/OTP 초대는 게스트 인증 흐름과 연동)"
      />
    </div>
  )
}
