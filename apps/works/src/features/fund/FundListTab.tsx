import { ListToolbar, Spinner } from '@ynarcher/ui'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ListActions } from '@/components/ListActions'
import { FundListFilters } from '@/features/fund/FundListFilters'
import { FundListTable } from '@/features/fund/FundListTable'
import {
  EMPTY_FUND_FILTERS,
  useFundListPage,
  type FundListFilterState,
} from '@/features/fund/fundListHooks'

/** 페이지당 행 수. */
const PAGE_SIZE = 20

interface FundListTabProps {
  /** 구분(전략) 프리필터. 지정 시 해당 구분 펀드만. */
  strategy?: 'AC' | 'VC' | 'PE' | null
  /** 지정 시 생성자 또는 담당자(대표펀드매니저·운용/관리 인력)가 이 사용자인 펀드만('내 펀드'). */
  mineUserId?: string | null
}

/**
 * 펀드 리스트뷰 컨테이너. 검색어·필터·페이지는 이 컴포넌트가 소유하고, 그 조건으로 좁히는 일은
 * 서버가 한다(useFundListPage) — 종전에는 원장 전량을 내려받아 브라우저에서 걸렀고,
 * '전체 펀드'가 열리면서 그 전량 로드가 기본 화면 중 하나가 되어 더는 둘 수 없었다.
 * 스코프(구분·내 펀드)와 좁힘(검색·필터)이 나뉘어 있어 건수도 둘로 온다.
 * (StartupPoolTab·ProgramListTab과 같은 절차)
 */
export function FundListTab({ strategy, mineUserId }: FundListTabProps) {
  const navigate = useNavigate()
  const [keyword, setKeyword] = useState('')
  const [filters, setFilters] = useState<FundListFilterState>(EMPTY_FUND_FILTERS)
  const [page, setPage] = useState(0)
  const [selected, setSelected] = useState<string[]>([])

  // 검색·필터·스코프 변경 시 첫 페이지로 되돌리고 선택을 비운다(빈 페이지·유령 선택 방지).
  const filtersKey = JSON.stringify(filters)
  useEffect(() => {
    setPage(0)
    setSelected([])
  }, [keyword, filtersKey, strategy, mineUserId])

  const { data, isLoading } = useFundListPage(
    keyword,
    filters,
    page,
    PAGE_SIZE,
    strategy,
    mineUserId,
  )

  const emptyText = strategy
    ? `${strategy} 구분으로 분류된 펀드가 없습니다. 펀드 등록·수정에서 구분을 지정하세요.`
    : '등록된 펀드가 없습니다.'

  return (
    <div className="space-y-3">
      <ListToolbar
        keyword={keyword}
        onKeywordChange={setKeyword}
        searchPlaceholder="펀드명·펀드코드·대표펀드매니저 검색"
        filters={
          <FundListFilters
            filters={filters}
            onChange={setFilters}
            hideStrategy={Boolean(strategy)}
          />
        }
        actions={
          <ListActions
            createLabel="펀드 등록"
            onCreate={() => navigate('/fund/new')}
            bulkTo="/fund/bulk"
          />
        }
      />

      {isLoading ? (
        <Spinner />
      ) : (
        <FundListTable
          rows={data?.rows ?? []}
          onRowClick={(f) => navigate(`/fund/${f.id}`)}
          selectedKeys={selected}
          onSelectionChange={setSelected}
          pagination={{ page, pageSize: PAGE_SIZE, total: data?.total ?? 0, onChange: setPage }}
          emptyText={emptyText}
        />
      )}
    </div>
  )
}
