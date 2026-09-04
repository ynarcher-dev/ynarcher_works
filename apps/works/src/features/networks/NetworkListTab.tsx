import { ListToolbar } from '@ynarcher/ui'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ListActions } from '@/components/ListActions'
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

/** 목록 페이지당 행 수(미분류 목록과 동일). */
const PAGE_SIZE = 30

/**
 * 범위별 화면 상수. 민감정보 정책 키(ADMIN '민감정보 관리')와 표 라벨만 다르다 —
 * 열·필터·검색·상세 진입은 두 범위가 같다. 정책 키는 메뉴명이 바뀌어도 그대로 둔다
 * (DB에 이 키로 저장돼 있다).
 */
const SCOPE_META: Record<NetworkListScope, { contentKey: string; label: string }> = {
  mine: { contentKey: 'networks.mine', label: '내 업로드 DB' },
  all: { contentKey: 'networks.all', label: '전체 네트워크' },
}

interface NetworkListTabProps {
  /** 'mine'은 내가 등록·편집·병합에 관여한 것만, 'all'은 볼 수 있는 전부. */
  scope: NetworkListScope
}

/**
 * 네트워크 통합 목록 탭.
 *
 * 원장이 하나이므로(2026-09-04 통합) 국내·해외가 한 표에 서고, 갈리는 것은 필터 축
 * (지역·구분)뿐이다. '내 업로드 DB'와 '전체 네트워크'가 이 화면 하나를 공유하며 범위로만
 * 갈린다 — 두 메뉴가 답해야 하는 것이 같으므로 열도 필터도 검색도 같아야 한다.
 * 미분류(구분 없음)는 분류 대기 작업 대기열이라 자기 메뉴(UnclassifiedTab)를 갖는다.
 */
export function NetworkListTab({ scope }: NetworkListTabProps) {
  const navigate = useNavigate()
  const [keyword, setKeyword] = useState('')
  const [page, setPage] = useState(0)
  const [filters, setFilters] = useState<NetworkFilterState>(EMPTY_NETWORK_FILTERS)
  const meta = SCOPE_META[scope]

  // 검색어·필터 변경 시 첫 페이지로 되돌린다(빈 페이지 방지).
  const filtersKey = JSON.stringify(filters)
  useEffect(() => setPage(0), [keyword, filtersKey])

  // 검색 가능 범위는 이 목록의 마스킹 정책이 정한다 — 가려진 필드는 검색어로도 잡지 않는다.
  const masked = useMaskPolicy(meta.contentKey)
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

  // 권역 카드는 지역을 해외로 좁혔을 때만 선다 — 국내 행에는 권역이 없어 섞어 세면
  // '미지정'이 늘 최대 칸이 되고 그 칸은 누를 조건이 없다.
  const overseasOnly =
    filters.regionScopes.length === 1 && filters.regionScopes[0] === 'OVERSEAS'

  return (
    <div className="space-y-3">
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

      {overseasOnly && (
        <RegionFilteredSummary
          scope={scope}
          keyword={keyword}
          filters={filters}
          searchScope={searchScope}
          onToggleRegion={(regionId) =>
            setFilters((f) => ({ ...f, regionIds: toggleAxisValue(f.regionIds, regionId) }))
          }
          onClearRegions={() => setFilters((f) => ({ ...f, regionIds: [] }))}
        />
      )}

      <ListToolbar
        keyword={keyword}
        onKeywordChange={setKeyword}
        searchPlaceholder={searchPlaceholderFor(searchScope)}
        filters={<NetworkListFilters filters={filters} onChange={setFilters} />}
        // 등록 버튼은 구분을 묻지 않고 곧장 작성 화면으로 간다 — 원장이 하나가 된 뒤
        // (2026-09-04 통합) 구분은 어디에 저장할지가 아니라 폼 안의 한 칸이고, 그 칸은 폼이
        // 이미 갖고 있다. 같은 것을 두 번 묻지 않는다.
        actions={
          <ListActions
            createLabel="신규 등록"
            onCreate={() => navigate('/networks/record/new')}
            bulkTo="/networks/bulk"
          />
        }
      />

      <MasterListView
        label={meta.label}
        contentKey={meta.contentKey}
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
