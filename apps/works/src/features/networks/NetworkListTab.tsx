import { ListToolbar } from '@ynarcher/ui'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ListActions } from '@/components/ListActions'
import { useMaskPolicy } from '@/features/admin/sensitiveStore'
import { NETWORK_PROFILE_COLUMNS } from '@/features/master/networkProfileColumns'
import { MasterListView } from '@/features/master/MasterListView'
import { NetworkListFilters } from '@/features/networks/NetworkListFilters'
import { DOMESTIC_LIST_ENTITIES, ENTITIES } from '@/features/networks/config'
import {
  EMPTY_NETWORK_LIST_FILTERS,
  searchPlaceholderFor,
  type NetworkListFilterState,
} from '@/features/networks/filters'
import {
  useNetworkListPage,
  type NetworkListRow,
  type NetworkListScope,
} from '@/features/networks/hooks'

/** 목록 페이지당 행 수(글로벌·미분류와 동일). */
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

/** 등록 대상 원장 선택지. 은퇴 원장(vendors)에는 새로 넣지 않는다. */
const CREATE_TARGETS = DOMESTIC_LIST_ENTITIES.filter((key) => key !== 'vendors')

interface NetworkListTabProps {
  /** 'mine'은 내가 등록·편집·병합에 관여한 것만, 'all'은 볼 수 있는 전부. */
  scope: NetworkListScope
}

/**
 * 국내 네트워크 통합 목록 탭: 원장 8종(+은퇴한 vendors)을 하나의 목록으로 보여준다.
 * '내 업로드 DB (국내)'와 '전체 네트워크 (국내)'가 이 화면 하나를 공유하며 범위(scope)로만
 * 갈린다 — 두 메뉴가 답해야 하는 것이 같으므로 열도 필터도 검색도 같아야 한다.
 * 글로벌과 미분류는 열 구성이 달라 각자 자기 메뉴(GlobalNetworkTab / DirectoryTab)를 갖는다.
 *
 * 엔티티가 물리적으로 분리되어 있어 통합 조회는 RPC가 담당하며, 표 구성은 공용 리스트뷰
 * (`MasterListView`)를 쓴다. 검색어·필터·액션은 이 탭이 소유하고 한 컨트롤 행에 모은다.
 */
export function NetworkListTab({ scope }: NetworkListTabProps) {
  const navigate = useNavigate()
  const [keyword, setKeyword] = useState('')
  const [page, setPage] = useState(0)
  const [filters, setFilters] = useState<NetworkListFilterState>(EMPTY_NETWORK_LIST_FILTERS)
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

  return (
    <div className="space-y-3">
      <ListToolbar
        keyword={keyword}
        onKeywordChange={setKeyword}
        searchPlaceholder={searchPlaceholderFor(searchScope)}
        filters={<NetworkListFilters filters={filters} onChange={setFilters} />}
        // 원장이 섞인 목록이라 '등록'만으로는 어느 원장에 넣을지가 정해지지 않는다. 그래서
        // 등록 버튼이 구분을 먼저 묻고, 고른 구분이 곧 저장 원장이 된다 — 원장별 사이드바
        // 메뉴가 갖고 있던 '{구분} 네트워크 등록'의 자리를 이 한 버튼이 이어받는다.
        actions={
          <ListActions
            createLabel="네트워크 등록"
            // 항목은 구분 이름만 적는다 — 버튼이 이미 '네트워크 등록'이라 항목마다
            // '네트워크'를 붙이면 같은 말이 두 번 선다(구분 필터 표기와도 맞춘다).
            createOptions={CREATE_TARGETS.map((key) => ({
              value: key,
              label: ENTITIES[key].label,
            }))}
            onCreateOption={(key) => navigate(`/networks/${key}/new`)}
            bulkTo="/networks/bulk"
          />
        }
      />

      <MasterListView
        label={meta.label}
        contentKey={meta.contentKey}
        // 원장 8종이 통일된 프로필 스키마를 공유하므로 프로필 공용 컬럼을 그대로 쓴다.
        // 영역·활동·만족도·매칭은 조직형(기업·기관·대학·기타)이 채우지 않는 열이지만, 열을
        // 원장별로 갈면 통합 목록이 성립하지 않는다 — 열은 세우고 값은 비운다('-').
        columns={NETWORK_PROFILE_COLUMNS}
        rows={data?.rows ?? []}
        isLoading={isLoading}
        // 행마다 원장 테이블이 달라 entity_table로 상세 라우트를 결정한다.
        onRowClick={(r) => {
          const row = r as NetworkListRow
          navigate(`/networks/${row.entity_table}/${row.id}`)
        }}
        // 비활성화는 엔티티별 테이블 컨텍스트가 필요해 통합 목록에서는 제공하지 않는다
        // (핸들러가 없으므로 관리 컬럼 자체가 렌더되지 않는다). 상세에서 수행한다.
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
