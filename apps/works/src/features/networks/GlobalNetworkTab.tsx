import { ListToolbar } from '@ynarcher/ui'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ListActions } from '@/components/ListActions'
import { useMaskPolicy } from '@/features/admin/sensitiveStore'
import { MasterListView } from '@/features/master/MasterListView'
import type { MasterRow } from '@/features/master/types'
import { GlobalNetworkFilters } from '@/features/networks/GlobalNetworkFilters'
import {
  EMPTY_GLOBAL_FILTERS,
  searchPlaceholderFor,
  type GlobalFilterState,
} from '@/features/networks/filters'
import { GLOBAL_COLUMNS } from '@/features/networks/globalConfig'
import { useGlobalPage } from '@/features/networks/globalHooks'

/** 목록 페이지당 행 수(국내 디렉토리와 동일). */
const PAGE_SIZE = 30

/** 민감정보 정책 콘텐츠 키(ADMIN '민감정보 관리'). */
const CONTENT_KEY = 'networks.global'

/**
 * 글로벌 네트워크 탭: 공용 리스트뷰(MasterListView) 재활용.
 * 국내 8종과 달리 독립 단일 마스터(global_networks)이며, 권역·국가는 조인된 태그명으로 표시한다.
 * 등록/수정은 모달이 아닌 상세페이지(/networks/global/:id)에서 처리하며, 비활성화(삭제)도 상세에서 수행한다.
 * 검색어·필터·액션은 국내 디렉토리와 같은 규격으로 한 컨트롤 행에 모은다.
 */
export function GlobalNetworkTab() {
  const navigate = useNavigate()
  const [keyword, setKeyword] = useState('')
  const [page, setPage] = useState(0)
  const [filters, setFilters] = useState<GlobalFilterState>(EMPTY_GLOBAL_FILTERS)

  // 검색어·필터가 바뀌면 첫 페이지로 되돌린다(빈 페이지에 남지 않도록).
  const filtersKey = JSON.stringify(filters)
  useEffect(() => setPage(0), [keyword, filtersKey])

  // 검색 가능 범위는 이 목록의 마스킹 정책이 정한다 — 가려진 필드는 검색어로도 잡지 않는다.
  const masked = useMaskPolicy(CONTENT_KEY)
  const searchScope = useMemo(
    () => ({ email: !masked.email, phone: !masked.phone }),
    [masked.email, masked.phone],
  )

  const { data, isLoading } = useGlobalPage(keyword, page, PAGE_SIZE, filters, searchScope)

  return (
    <div className="space-y-3">
      <ListToolbar
        keyword={keyword}
        onKeywordChange={setKeyword}
        searchPlaceholder={searchPlaceholderFor(searchScope)}
        filters={<GlobalNetworkFilters filters={filters} onChange={setFilters} />}
        actions={
          <ListActions
            createLabel="글로벌 네트워크 등록"
            onCreate={() => navigate('/networks/global/new')}
            bulkTo="/networks/bulk?scope=global"
          />
        }
      />

      <MasterListView
        label="글로벌 네트워크"
        contentKey={CONTENT_KEY}
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
