import { Badge, Card, DataTable, Spinner, type Column } from '@ynarcher/ui'
import dayjs from 'dayjs'
import { RecruitmentSettingsPanel } from '@/features/ac/recruitment/RecruitmentSettingsPanel'
import { useByProgram, type Row } from '@/features/ac/moduleHooks'

const columns: Column<Row>[] = [
  { key: 'startup_id', header: '지원 기업', render: (r) => String(r.startup_id ?? '-').slice(0, 8) },
  { key: 'status', header: '상태', render: (r) => <Badge tone="info">{String(r.status)}</Badge> },
  {
    key: 'submitted_at',
    header: '제출일',
    render: (r) => (r.submitted_at ? dayjs(String(r.submitted_at)).format('YYYY-MM-DD') : '-'),
  },
]

/**
 * 모집 운영 화면(인스턴스 단위). 좌측 신청 현황(접수 목록) + 우측 모집 설정(폼빌더).
 * (신청 현황 동적 컬럼·상세는 후속 커밋에서 신청서 필드 기반으로 확장)
 */
export function RecruitmentPanel({ programId, moduleId }: { programId: string; moduleId: string }) {
  const { data, isLoading } = useByProgram(
    'application_submissions',
    programId,
    'id, status, submitted_at, startup_id',
  )

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card className="space-y-3 p-4">
        <div>
          <h3 className="text-body font-semibold text-gray-900">신청 현황</h3>
          <p className="text-caption text-gray-500">
            공개 랜딩페이지로 접수된 신청 기업입니다. 행을 열어 심사하고, 선발 기업은 계정을 발급합니다.
          </p>
        </div>
        {isLoading ? (
          <Spinner />
        ) : (
          <DataTable
            columns={columns}
            rows={data ?? []}
            rowKey={(r) => r.id}
            emptyText="접수된 지원서가 없습니다. (모집 폼 공개 후 수집)"
          />
        )}
      </Card>

      <RecruitmentSettingsPanel programId={programId} moduleId={moduleId} />
    </div>
  )
}
