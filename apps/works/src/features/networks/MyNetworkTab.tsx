import { ListToolbar } from '@ynarcher/ui'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ListActions } from '@/components/ListActions'
import { useMaskPolicy } from '@/features/admin/sensitiveStore'
import { NETWORK_ORG_COLUMNS } from '@/features/master/networkProfileColumns'
import { MasterListView } from '@/features/master/MasterListView'
import { MyNetworkFilters } from '@/features/networks/MyNetworkFilters'
import {
  EMPTY_MY_NETWORK_FILTERS,
  GLOBAL_ENTITY_KEY,
  searchPlaceholderFor,
  type MyNetworkFilterState,
} from '@/features/networks/filters'
import { useMyNetworkPage, type MyNetworkRow } from '@/features/networks/hooks'

/** 목록 페이지당 행 수(디렉토리·글로벌과 동일). */
const PAGE_SIZE = 30

/** 민감정보 정책 콘텐츠 키(ADMIN '민감정보 관리'). */
const CONTENT_KEY = 'networks.mine'

/**
 * 원장 테이블명 → 상세 라우트 세그먼트. 디렉토리 10종은 테이블명이 곧 세그먼트지만
 * 글로벌만 라우트가 짧다(/networks/global/:id) — 통합 목록에만 있는 어긋남이라 여기서 흡수한다.
 */
function detailSegment(entityTable: string): string {
  return entityTable === GLOBAL_ENTITY_KEY ? 'global' : entityTable
}

/**
 * 내 네트워크 탭: 내가 등록·편집·병합에 관여한 10종 엔티티를 하나의 목록으로 보여준다.
 * 엔티티가 물리적으로 분리되어 있어 통합 조회는 RPC(`my_network_entities`)가 담당하며,
 * 표 구성은 다른 네트워크 디렉토리와 동일하게 공용 리스트뷰(`MasterListView`)를 사용한다.
 * 검색어는 통합 목록 고유의 축이라 페이지 헤더가 아니라 이 탭이 직접 소유한다.
 * 어느 엔티티로 등록할지 모호하므로 등록 버튼은 두지 않는다(행 클릭 → 각 원장 상세페이지).
 */
export function MyNetworkTab() {
  const navigate = useNavigate()
  const [keyword, setKeyword] = useState('')
  const [page, setPage] = useState(0)
  const [filters, setFilters] = useState<MyNetworkFilterState>(EMPTY_MY_NETWORK_FILTERS)

  // 검색어·필터 변경 시 첫 페이지로 되돌린다(빈 페이지 방지).
  const filtersKey = JSON.stringify(filters)
  useEffect(() => setPage(0), [keyword, filtersKey])

  // 검색 가능 범위는 이 목록의 마스킹 정책이 정한다 — 가려진 필드는 검색어로도 잡지 않는다.
  const masked = useMaskPolicy(CONTENT_KEY)
  const searchScope = useMemo(
    () => ({ email: !masked.email, phone: !masked.phone }),
    [masked.email, masked.phone],
  )

  const { data, isLoading } = useMyNetworkPage(keyword, page, PAGE_SIZE, filters, searchScope)

  return (
    <div className="space-y-3">
      <ListToolbar
        keyword={keyword}
        onKeywordChange={setKeyword}
        searchPlaceholder={searchPlaceholderFor(searchScope)}
        filters={<MyNetworkFilters filters={filters} onChange={setFilters} />}
        // 등록 버튼은 두지 않는다 — 종류가 섞인 목록이라 '어느 원장에 넣을지'가 정해지지 않는다.
        // 대신 등록은 각 네트워크 목록에서, 업로드는 여기서도 바로 들어갈 수 있게 둔다.
        actions={<ListActions bulkTo="/networks/bulk" />}
      />

      <MasterListView
        label="내 네트워크"
        contentKey={CONTENT_KEY}
        // 원장 11종이 통일된 프로필 스키마를 공유하므로 조직형 공용 컬럼을 그대로 사용한다
        // (이름·소속·부서·직책/직급·이메일·연락처·구분). 개인 지표(분야·활동·만족도·매칭)는
        // 엔티티마다 의미가 달라 통합 목록에서는 노출하지 않으며, 글로벌 고유 열(권역·국가·
        // 링크드인)도 다른 원장이 채울 수 없어 두지 않는다 — 통합 목록은 공통분모만 보여준다.
        columns={NETWORK_ORG_COLUMNS}
        rows={data?.rows ?? []}
        isLoading={isLoading}
        // 행마다 원장 테이블이 달라 entity_table로 상세 라우트를 결정한다.
        onRowClick={(r) => {
          const row = r as MyNetworkRow
          navigate(`/networks/${detailSegment(row.entity_table)}/${row.id}`)
        }}
        // 비활성화는 엔티티별 테이블 컨텍스트가 필요해 통합 목록에서는 제공하지 않는다
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
