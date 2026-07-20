import { Badge, DataTable, Input, Spinner, type Column } from '@ynarcher/ui'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { maskEmail, maskPhone } from '@/lib/mask'
import { useSensitiveStore } from '@/features/admin/sensitiveStore'
import { ENTITIES } from '@/features/networks/config'
import { useMyNetworkPage, type MyNetworkRow } from '@/features/networks/hooks'

/** 목록 페이지당 행 수(디렉토리·글로벌과 동일). */
const PAGE_SIZE = 30

/** 최근 기여 행위 라벨. RPC가 돌려주는 entity_contributions.action 값과 1:1 대응한다. */
const ACTION_LABELS: Record<string, string> = {
  created: '등록',
  merged: '병합',
  enriched: '보강',
  edited: '수정',
}

/** ISO 타임스탬프를 YYYY-MM-DD로 절삭한다(DataTable 표준 컬럼과 동일 표기). */
function formatDate(value: string | null): string {
  if (!value) return ''
  return value.length >= 10 ? value.slice(0, 10) : value
}

/**
 * 내 네트워크 탭: 내가 등록·편집·병합에 관여한 10종 엔티티를 하나의 목록으로 보여준다.
 * 엔티티가 물리적으로 분리되어 있어 통합 조회는 RPC(`my_network_entities`)가 담당하며,
 * 검색어는 통합 목록 고유의 축이라 페이지 헤더가 아니라 이 탭이 직접 소유한다.
 * 어느 엔티티로 등록할지 모호하므로 등록 버튼은 두지 않는다(행 클릭 → 각 원장 상세페이지).
 */
export function MyNetworkTab() {
  const navigate = useNavigate()
  const show = useSensitiveStore((s) => s.show)
  const [keyword, setKeyword] = useState('')
  const [page, setPage] = useState(0)

  // 검색어 변경 시 첫 페이지로 되돌린다(빈 페이지 방지).
  useEffect(() => setPage(0), [keyword])
  const { data, isLoading } = useMyNetworkPage(keyword, page, PAGE_SIZE)

  const columns = useMemo<Column<MyNetworkRow>[]>(
    () => [
      {
        key: 'entity_table',
        header: '종류',
        className: 'w-24',
        // 종류 라벨은 ENTITIES 정의가 단일 원천(하드코딩 금지).
        render: (r) => (
          <Badge tone="neutral" size="sm">
            {ENTITIES[r.entity_table]?.label ?? r.entity_table}
          </Badge>
        ),
      },
      { key: 'name', header: '이름', className: 'w-28', render: (r) => r.name || '-' },
      { key: 'affiliation', header: '소속', className: 'w-40', render: (r) => r.affiliation || '-' },
      {
        key: 'email',
        header: '이메일',
        className: 'w-44',
        // 개인정보 목록 마스킹 의무(ADMIN 민감정보 정책이 공개로 열려 있을 때만 원본).
        render: (r) => (show.email ? (r.email ?? '-') : maskEmail(r.email)),
      },
      {
        key: 'phone',
        header: '연락처',
        className: 'w-32',
        render: (r) => (show.phone ? (r.phone ?? '-') : maskPhone(r.phone)),
      },
      {
        key: 'last_contributed_at',
        header: '최근 기여',
        className: 'w-36',
        render: (r) => {
          const action = r.last_action ? (ACTION_LABELS[r.last_action] ?? r.last_action) : ''
          const date = formatDate(r.last_contributed_at)
          if (!action && !date) return '-'
          return (
            <span className="whitespace-nowrap">
              {action && <span className="text-gray-800">{action}</span>}
              {action && date && <span className="text-gray-300"> · </span>}
              {date && <span className="text-gray-500 tabular-nums">{date}</span>}
            </span>
          )
        },
      },
    ],
    [show.email, show.phone],
  )

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="w-64">
          <Input
            placeholder="이름·소속 검색"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
        </div>
      </div>

      {isLoading ? (
        <Spinner />
      ) : (
        <DataTable
          columns={columns}
          rows={data?.rows ?? []}
          rowKey={(r) => `${r.entity_table}:${r.id}`}
          layout="fixed"
          // RPC 반환 행에는 등록자·수정일·활성 상태가 없어 표준 메타 컬럼을 노출하지 않는다.
          standardColumns={false}
          onRowClick={(r) => navigate(`/networks/${r.entity_table}/${r.id}`)}
          pagination={{
            page,
            pageSize: PAGE_SIZE,
            total: data?.total ?? 0,
            onChange: setPage,
          }}
          emptyText="내가 관여한 네트워크가 없습니다."
        />
      )}
    </div>
  )
}
