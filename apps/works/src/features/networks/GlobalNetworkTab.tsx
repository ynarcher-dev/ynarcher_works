import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MasterListView } from '@/features/master/MasterListView'
import type { MasterRow } from '@/features/master/types'
import { GlobalNetworkFilters } from '@/features/networks/GlobalNetworkFilters'
import { EMPTY_GLOBAL_FILTERS, type GlobalFilterState } from '@/features/networks/filters'
import { GLOBAL_COLUMNS } from '@/features/networks/globalConfig'
import { useGlobalPage } from '@/features/networks/globalHooks'

/** 목록 페이지당 행 수(국내 디렉토리와 동일). */
const PAGE_SIZE = 30

interface Props {
  keyword: string
}

/**
 * 글로벌 네트워크 탭: 공용 리스트뷰(MasterListView) 재활용.
 * 국내 8종과 달리 독립 단일 마스터(global_networks)이며, 권역·국가는 조인된 태그명으로 표시한다.
 * 등록/수정은 모달이 아닌 상세페이지(/networks/global/:id)에서 처리하며, 비활성화(삭제)도 상세에서 수행한다.
 */
export function GlobalNetworkTab({ keyword }: Props) {
  const navigate = useNavigate()
  const [page, setPage] = useState(0)
  const [filters, setFilters] = useState<GlobalFilterState>(EMPTY_GLOBAL_FILTERS)

  // 검색어·필터가 바뀌면 첫 페이지로 되돌린다(빈 페이지에 남지 않도록).
  const filtersKey = JSON.stringify(filters)
  useEffect(() => setPage(0), [keyword, filtersKey])
  const { data, isLoading } = useGlobalPage(keyword, page, PAGE_SIZE, filters)

  return (
    <div className="space-y-3">
      <GlobalNetworkFilters filters={filters} onChange={setFilters} />

      <MasterListView
        label="글로벌 네트워크"
        contentKey="networks.global"
        columns={GLOBAL_COLUMNS}
        rows={(data?.rows ?? []) as MasterRow[]}
        isLoading={isLoading}
        onRowClick={(r) => navigate(`/networks/global/${r.id}`)}
        pagination={{
          page,
          pageSize: PAGE_SIZE,
          total: data?.total ?? 0,
          totalAll: data?.totalAll ?? 0,
          onChange: setPage,
        }}
      />
    </div>
  )
}
