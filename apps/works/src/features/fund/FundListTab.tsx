import { ListToolbar, Spinner } from '@ynarcher/ui'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { hasWorkspaceWrite, useAuthStore } from '@/auth/authStore'
import { ListActions } from '@/components/ListActions'
import { ListScopeToggle } from '@/components/ListScopeToggle'
import { InactiveLedgerButton } from '@/features/master/InactiveLedgerModal'
import { LedgerBulkDeactivateBar } from '@/features/master/LedgerBulkDeactivateBar'
import { creatorDeactivateSelection } from '@/features/master/ledgerSelection'
import { FundListFilters } from '@/features/fund/FundListFilters'
import { FundListTable } from '@/features/fund/FundListTable'
import { FundSummaryPanel } from '@/features/fund/FundSummaryPanel'
import {
  EMPTY_FUND_FILTERS,
  useFundListPage,
  type FundListFilterState,
  type FundListRow,
} from '@/features/fund/fundListHooks'
import type { ListScope } from '@/lib/listScope'

/** 페이지당 행 수. */
const PAGE_SIZE = 20

/**
 * 범위 스위치가 부르는 이름 — **'내 펀드'**다(2026-09-10 사용자 지정).
 *
 * 페이지 제목은 '운용펀드'로 남는다. 제목은 이 목록이 담는 것을 말하는 자리지만, 스위치는
 * 내가 낀 것만 남기는 축이라 짧을수록 무엇이 걸리는지가 빨리 읽힌다.
 */
const SCOPE_LABEL = '내 펀드'

interface FundListTabProps {
  /** 'mine'은 생성자 또는 담당자(대표펀드매니저·운용/관리 인력)가 나인 펀드만, 'all'은 전부. */
  scope: ListScope
  onScopeChange: (scope: ListScope) => void
  /** 로그인 사용자 id. 'mine' 범위에서만 조회 조건으로 걸린다. */
  userId: string | null
}

/**
 * 펀드 리스트뷰 컨테이너. 검색어·필터·페이지는 이 컴포넌트가 소유하고, 그 조건으로 좁히는 일은
 * 서버가 한다(useFundListPage) — 종전에는 원장 전량을 내려받아 브라우저에서 걸렀고,
 * '전체 운용펀드'가 열리면서 그 전량 로드가 기본 화면 중 하나가 되어 더는 둘 수 없었다.
 * 스코프(내 운용펀드)와 좁힘(검색·필터)이 나뉘어 있어 건수도 둘로 온다.
 * (StartupPoolTab·ProgramListTab과 같은 절차)
 */
export function FundListTab({ scope, onScopeChange, userId }: FundListTabProps) {
  const mineUserId = scope === 'mine' ? userId : null
  const navigate = useNavigate()
  const authUser = useAuthStore((s) => s.user)
  const canWrite = hasWorkspaceWrite(authUser, 'fund')
  const [keyword, setKeyword] = useState('')
  const [filters, setFilters] = useState<FundListFilterState>(EMPTY_FUND_FILTERS)
  const [page, setPage] = useState(0)
  const [selected, setSelected] = useState<string[]>([])

  // 검색·필터·스코프 변경 시 첫 페이지로 되돌리고 선택을 비운다(빈 페이지·유령 선택 방지).
  const filtersKey = JSON.stringify(filters)
  useEffect(() => {
    setPage(0)
    setSelected([])
  }, [keyword, filtersKey, scope])

  // 페이지를 넘기면 선택을 비운다 — 화면에서 사라진 행의 선택이 남으면 일괄 비활성화가
  // 보이지 않는 행에 걸린다(STARTUP·NETWORKS 목록과 같은 처리).
  useEffect(() => setSelected([]), [page])

  const { data, isLoading, isPlaceholderData } = useFundListPage(
    keyword,
    filters,
    page,
    PAGE_SIZE,
    mineUserId,
  )
  const rows = data?.rows ?? []
  // 선택 열은 쓰기 권한으로 서고, 고를 수 있는 행은 생성자 전용 트리거와 같은 조건이다.
  const { selectable, selectableRow } = creatorDeactivateSelection<FundListRow>(
    canWrite,
    authUser?.id,
    authUser?.role === 'super_admin',
  )

  return (
    <div className="space-y-3">
      {/* 요약 카드는 두 스코프에 모두 둔다 — 검색어·필터가 집계에 반영되므로 '내 펀드'를 끈 전체 범위에서도
          "지금 좁혀 놓은 범위에 돈이 어디까지 와 있나"라는 같은 질문이 성립한다.
          (사업 진행 현황 카드를 두 스코프 모두에 둔 것과 같은 판단) */}
      <FundSummaryPanel
        keyword={keyword}
        filters={filters}
        mineUserId={mineUserId}
        listTotal={data?.total}
        listIsPlaceholderData={isPlaceholderData}
      />

      <ListToolbar
        // 필터 축이 일곱(다중선택 5 + 존속기간 + 잔액 범위)이라 works에서 가장 빠듯한 툴바다 —
        // 검색창을 한 단 좁혀 등록·업로드 액션이 아랫줄로 밀리지 않게 한다.
        dense
        keyword={keyword}
        onKeywordChange={setKeyword}
        // '펀드코드'의 '펀드'는 앞의 '펀드명'이 이미 말했다.
        searchPlaceholder="펀드명·코드·대표펀드매니저 검색"
        filters={<FundListFilters filters={filters} onChange={setFilters} />}
        actions={
          <ListActions
            leading={
              <>
                <ListScopeToggle scope={scope} onChange={onScopeChange} label={SCOPE_LABEL} />
                <InactiveLedgerButton ledger="funds" />
              </>
            }
            createLabel="펀드 등록"
            onCreate={() => navigate('/fund/new')}
            bulkTo="/fund/bulk"
          />
        }
      />

      <LedgerBulkDeactivateBar
        ledger="funds"
        noun="펀드"
        selectedIds={selected}
        onDone={() => {
          if (selected.length === rows.length && page > 0) setPage((p) => p - 1)
          setSelected([])
        }}
      />

      {isLoading ? (
        <Spinner />
      ) : (
        <FundListTable
          rows={rows}
          onRowClick={(f) => navigate(`/fund/${f.id}`)}
          selectedKeys={selected}
          onSelectionChange={setSelected}
          selectable={selectable}
          selectableRow={selectableRow}
          pagination={{ page, pageSize: PAGE_SIZE, total: data?.total ?? 0, onChange: setPage }}
          emptyText="등록된 펀드가 없습니다."
        />
      )}
    </div>
  )
}
