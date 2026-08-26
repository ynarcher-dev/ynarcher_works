import { ListToolbar } from '@ynarcher/ui'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ListActions } from '@/components/ListActions'
import { useMaskPolicy } from '@/features/admin/sensitiveStore'
import { MasterListView } from '@/features/master/MasterListView'
import type { MasterRow } from '@/features/master/types'
import { GlobalNetworkFilters } from '@/features/networks/GlobalNetworkFilters'
import { GlobalRegionFilteredSummary } from '@/features/networks/GlobalRegionFilteredSummary'
import {
  EMPTY_GLOBAL_FILTERS,
  searchPlaceholderFor,
  type GlobalFilterState,
} from '@/features/networks/filters'
import { GLOBAL_COLUMNS } from '@/features/networks/globalConfig'
import { useGlobalPage, type GlobalListScope } from '@/features/networks/globalHooks'
import { toggleAxisValue } from '@/lib/filterAxis'

/** 목록 페이지당 행 수(국내 통합 목록과 동일). */
const PAGE_SIZE = 30

/**
 * 민감정보 정책 콘텐츠 키(ADMIN '민감정보 관리').
 * 두 범위가 한 원장·같은 열을 보므로 정책도 하나다 — 범위별로 가림을 달리 할 이유가 없다.
 */
const CONTENT_KEY = 'networks.global'

/** 범위별 표 라벨. 열·필터·검색·상세 진입은 두 범위가 같다. */
const SCOPE_LABEL: Record<GlobalListScope, string> = {
  mine: '내 업로드 DB',
  all: '전체 네트워크',
}

interface GlobalNetworkTabProps {
  /** 'mine'은 내가 생성했거나 기여한 것만, 'all'은 볼 수 있는 전부. */
  scope: GlobalListScope
}

/**
 * 글로벌 네트워크 탭: 공용 리스트뷰(MasterListView) 재활용.
 * 국내와 달리 독립 단일 마스터(global_networks)라 권역·국가·링크드인 열을 갖는다 —
 * 국내 통합 목록에 합치지 않고 자기 한 쌍(내 업로드 DB / 전체 네트워크)을 갖는 이유다.
 * 등록/수정은 모달이 아닌 상세페이지(/networks/global/:id)에서 처리하며, 비활성화(삭제)도 상세에서 수행한다.
 * 검색어·필터·액션은 국내 통합 목록과 같은 규격으로 한 컨트롤 행에 모은다.
 */
export function GlobalNetworkTab({ scope }: GlobalNetworkTabProps) {
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

  const { data, isLoading } = useGlobalPage(scope, keyword, page, PAGE_SIZE, filters, searchScope)

  return (
    <div className="space-y-3">
      <GlobalRegionFilteredSummary
        scope={scope}
        keyword={keyword}
        filters={filters}
        searchScope={searchScope}
        onToggleRegion={(regionId) =>
          setFilters((f) => ({ ...f, regionIds: toggleAxisValue(f.regionIds, regionId) }))
        }
        onClearRegions={() => setFilters((f) => ({ ...f, regionIds: [] }))}
      />

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
        label={SCOPE_LABEL[scope]}
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
