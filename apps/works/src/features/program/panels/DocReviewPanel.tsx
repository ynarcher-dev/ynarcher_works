import { Badge, DataTable, Spinner, type Column } from '@ynarcher/ui'
import dayjs from 'dayjs'
import { useByModuleId, type Row } from '@/features/program/moduleHooks'

const columns: Column<Row>[] = [
  { key: 'status', header: '라운드 상태', render: (r) => <Badge tone="info">{String(r.status)}</Badge> },
  { key: 'opens_at', header: '시작', render: (r) => (r.opens_at ? dayjs(String(r.opens_at)).format('MM-DD HH:mm') : '-') },
  { key: 'closes_at', header: '마감', render: (r) => (r.closes_at ? dayjs(String(r.closes_at)).format('MM-DD HH:mm') : '-') },
]

/** 서면평가 라운드. (7-5 — 평가 엔진 기반, 심사위원 배정/Split View는 후속) */
export function DocReviewPanel({ moduleId }: { moduleId: string }) {
  const { data, isLoading } = useByModuleId(
    'document_review_rounds',
    moduleId,
    'id, status, opens_at, closes_at',
  )
  if (isLoading) return <Spinner />
  return (
    <DataTable
      columns={columns}
      rows={data ?? []}
      rowKey={(r) => r.id}
      emptyText="서면평가 라운드가 없습니다. (DOC_REVIEW 모듈 활성화 후 생성)"
    />
  )
}
