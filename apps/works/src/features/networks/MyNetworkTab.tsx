import { Input } from '@ynarcher/ui'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { NETWORK_ORG_COLUMNS } from '@/features/master/networkProfileColumns'
import { MasterListView } from '@/features/master/MasterListView'
import { useMyNetworkPage, type MyNetworkRow } from '@/features/networks/hooks'

/** 목록 페이지당 행 수(디렉토리·글로벌과 동일). */
const PAGE_SIZE = 30

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

  // 검색어 변경 시 첫 페이지로 되돌린다(빈 페이지 방지).
  useEffect(() => setPage(0), [keyword])
  const { data, isLoading } = useMyNetworkPage(keyword, page, PAGE_SIZE)

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

      <MasterListView
        label="내 네트워크"
        // 10종이 통일된 프로필 스키마를 공유하므로 조직형 공용 컬럼을 그대로 사용한다
        // (이름·소속·부서·직책/직급·이메일·연락처·구분). 개인 지표(분야·활동·만족도·매칭)는
        // 엔티티마다 의미가 달라 통합 목록에서는 노출하지 않는다.
        columns={NETWORK_ORG_COLUMNS}
        rows={data?.rows ?? []}
        isLoading={isLoading}
        // 행마다 원장 테이블이 달라 entity_table로 상세 라우트를 결정한다.
        onRowClick={(r) => {
          const row = r as MyNetworkRow
          navigate(`/networks/${row.entity_table}/${row.id}`)
        }}
        // 비활성화는 엔티티별 테이블 컨텍스트가 필요해 통합 목록에서는 제공하지 않는다
        // (관리 컬럼의 비활성화 버튼은 비활성 상태로 노출된다).
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
