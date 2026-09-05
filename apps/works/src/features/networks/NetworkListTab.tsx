import { ListToolbar } from '@ynarcher/ui'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ListActions } from '@/components/ListActions'
import { ListScopeToggle } from '@/components/ListScopeToggle'
import { useMaskPolicy } from '@/features/admin/sensitiveStore'
import { MasterListView } from '@/features/master/MasterListView'
import { NetworkListFilters } from '@/features/networks/NetworkListFilters'
import { NetworkFilteredSummary } from '@/features/networks/NetworkFilteredSummary'
import { RegionFilteredSummary } from '@/features/networks/RegionFilteredSummary'
import { NETWORK_LIST_COLUMNS } from '@/features/networks/config'
import {
  EMPTY_NETWORK_FILTERS,
  searchPlaceholderFor,
  type NetworkFilterState,
} from '@/features/networks/filters'
import {
  useNetworkListPage,
  type NetworkRow,
  type NetworkListScope,
} from '@/features/networks/hooks'
import { toggleAxisValue } from '@/lib/filterAxis'

/** 목록 페이지당 행 수. */
const PAGE_SIZE = 30

/**
 * 범위별 민감정보 정책 키(ADMIN '민감정보 관리'). 정책 키는 메뉴명·라벨이 바뀌어도 그대로
 * 둔다 — DB에 이 키로 저장돼 있다. 열·필터·검색·상세 진입은 두 범위가 같다.
 */
const SCOPE_CONTENT_KEY: Record<NetworkListScope, string> = {
  mine: 'networks.mine',
  all: 'networks.all',
}

/**
 * 표가 비었을 때 부르는 이름. 범위 라벨('내 네트워크')을 넣지 않는다 — 비어 있다는 사실은
 * 범위가 아니라 원장에 대한 말이다.
 */
const ENTITY_NOUN = '네트워크'

interface NetworkListTabProps {
  /** 'mine'은 내가 등록·편집·병합에 관여한 것만, 'all'은 볼 수 있는 전부. */
  scope: NetworkListScope
  /** 범위 토글. 주소(`?scope=`)를 소유한 NetworksPage가 내려준다. */
  onScopeChange: (scope: NetworkListScope) => void
}

/**
 * 네트워크 통합 목록 탭.
 *
 * 원장이 하나이므로(2026-09-04 통합) 국내·해외가 한 표에 서고, 갈리는 것은 필터 축
 * (지역·구분)뿐이다. 범위(내 네트워크/전체 네트워크)도 2026-09-05에 메뉴에서 내려와 같은 성격의
 * 축 하나가 되었다 — 열도 필터도 검색도 두 범위가 같으므로 화면을 나눌 이유가 없다.
 * 구분이 비어 있는 행도 이 목록에 담기며, 그것만 보려면 구분 필터의 '미지정'을 건다.
 *
 * 범위를 바꿔도 검색어·필터는 그대로 둔다 — 토글은 화면 이동이 아니라 같은 질문의 범위를
 * 넓히고 좁히는 일이라, 좁혀 둔 조건을 매번 다시 걸게 하면 토글을 누를 이유가 없어진다.
 * 되돌리는 것은 페이지 번호뿐이다(넓힌 목록의 3페이지는 방금 보던 그 3페이지가 아니다).
 */
export function NetworkListTab({ scope, onScopeChange }: NetworkListTabProps) {
  const navigate = useNavigate()
  const [keyword, setKeyword] = useState('')
  const [page, setPage] = useState(0)
  const [filters, setFilters] = useState<NetworkFilterState>(EMPTY_NETWORK_FILTERS)
  const contentKey = SCOPE_CONTENT_KEY[scope]

  // 검색어·필터·범위 변경 시 첫 페이지로 되돌린다(빈 페이지 방지).
  const filtersKey = JSON.stringify(filters)
  useEffect(() => setPage(0), [keyword, filtersKey, scope])

  // 검색 가능 범위는 이 목록의 마스킹 정책이 정한다 — 가려진 필드는 검색어로도 잡지 않는다.
  const masked = useMaskPolicy(contentKey)
  const searchScope = useMemo(
    () => ({ email: !masked.email, phone: !masked.phone }),
    [masked.email, masked.phone],
  )

  const { data, isLoading } = useNetworkListPage(
    scope,
    keyword,
    page,
    PAGE_SIZE,
    filters,
    searchScope,
  )

  // 두 요약 카드는 상시로 선다(2026-09-05). 어디 사람인가 → 어떤 구분인가 순으로 내려가는
  // 것이 목록을 좁히는 순서이므로 권역이 위, 구성이 아래다. 권역 카드가 필터 줄에서 내려온
  // 지역(국내/해외) 축까지 함께 소유한다.
  return (
    <div className="space-y-3">
      <RegionFilteredSummary
        scope={scope}
        keyword={keyword}
        filters={filters}
        searchScope={searchScope}
        onChangeRegions={(regionIds) => setFilters((f) => ({ ...f, regionIds }))}
      />

      <NetworkFilteredSummary
        scope={scope}
        keyword={keyword}
        filters={filters}
        searchScope={searchScope}
        onToggleCategory={(category) =>
          setFilters((f) => ({ ...f, categories: toggleAxisValue(f.categories, category) }))
        }
        onClearCategories={() => setFilters((f) => ({ ...f, categories: [] }))}
      />

      <ListToolbar
        keyword={keyword}
        onKeywordChange={setKeyword}
        searchPlaceholder={searchPlaceholderFor(searchScope)}
        filters={<NetworkListFilters filters={filters} onChange={setFilters} />}
        // 필터 축이 많은 줄에 범위 토글까지 서므로 검색창을 한 단 좁힌다.
        dense
        // 등록 버튼은 구분을 묻지 않고 곧장 작성 화면으로 간다 — 원장이 하나가 된 뒤
        // (2026-09-04 통합) 구분은 어디에 저장할지가 아니라 폼 안의 한 칸이고, 그 칸은 폼이
        // 이미 갖고 있다. 같은 것을 두 번 묻지 않는다.
        actions={
          <ListActions
            leading={
              <ListScopeToggle scope={scope} onChange={onScopeChange} noun={ENTITY_NOUN} />
            }
            createLabel="신규 등록"
            onCreate={() => navigate('/networks/record/new')}
            bulkTo="/networks/bulk"
          />
        }
      />

      <MasterListView
        label={ENTITY_NOUN}
        contentKey={contentKey}
        // 원장이 하나이므로 열도 한 벌이다. 영역·활동·만족도·매칭은 조직형(기업·기관·대학·
        // 기타)이 채우지 않는 열이지만, 열을 구분별로 갈면 통합 목록이 성립하지 않는다 —
        // 열은 세우고 값은 비운다('-').
        columns={NETWORK_LIST_COLUMNS}
        rows={data?.rows ?? []}
        isLoading={isLoading}
        onRowClick={(r) => navigate(`/networks/record/${(r as NetworkRow).id}`)}
        // 비활성화는 사유·영향 확인이 필요해 목록이 아니라 상세에서 수행한다
        // (핸들러가 없으므로 관리 컬럼 자체가 렌더되지 않는다).
        pagination={{
          page,
          pageSize: PAGE_SIZE,
          total: data?.total ?? 0,
          onChange: setPage,
        }}
      />
    </div>
  )
}
