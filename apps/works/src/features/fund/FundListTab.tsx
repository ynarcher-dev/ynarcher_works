import { Button, Input, Spinner } from '@ynarcher/ui'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FundListFilters } from '@/features/fund/FundListFilters'
import { FundListTable } from '@/features/fund/FundListTable'
import {
  EMPTY_FUND_FILTERS,
  useFundList,
  type FundListFilterState,
  type FundListRow,
} from '@/features/fund/fundListHooks'

/** 페이지당 행 수. 펀드는 건수가 적어 클라이언트 측 페이지네이션으로 충분하다. */
const PAGE_SIZE = 20

interface FundListTabProps {
  /** 유형구분(전략) 프리필터. 지정 시 해당 전략 펀드만(유형 탭이 대시보드 테이블을 상속). */
  strategy?: 'AC' | 'VC' | 'PE' | 'PROJECT' | 'BLIND' | null
  /** 지정 시 등록자 또는 대표펀드매니저가 이 사용자인 펀드만('내 펀드'). */
  mineUserId?: string | null
}

/**
 * 펀드 리스트뷰 컨테이너: useFundList 데이터를 공용 FundListTable에 공급한다.
 * 검색(펀드명·대표펀드매니저)·재원/성격/상태 필터·유형(탭)·내 펀드 스코프를 클라이언트 측에서 적용하고,
 * 다중선택과 페이지네이션을 소유한다. StartupPoolTab 패턴 미러링(펀드는 건수가 적어 클라이언트 페이징).
 */
export function FundListTab({ strategy, mineUserId }: FundListTabProps) {
  const navigate = useNavigate()
  const { data, isLoading } = useFundList()
  const [keyword, setKeyword] = useState('')
  const [filters, setFilters] = useState<FundListFilterState>(EMPTY_FUND_FILTERS)
  const [page, setPage] = useState(0)
  const [selected, setSelected] = useState<string[]>([])

  const filtered = useMemo<FundListRow[]>(() => {
    let out = data ?? []
    const kw = keyword.trim().toLowerCase()
    if (kw) {
      out = out.filter(
        (f) =>
          f.name.toLowerCase().includes(kw) ||
          (f.manager?.name ?? '').toLowerCase().includes(kw),
      )
    }
    if (filters.statuses.length) out = out.filter((f) => filters.statuses.includes(f.status))
    if (filters.sources.length) out = out.filter((f) => !!f.source_type && filters.sources.includes(f.source_type))
    if (filters.characters.length)
      out = out.filter((f) => !!f.character_type && filters.characters.includes(f.character_type))
    // 유형구분(strategy_type) 프리필터 — 미분류(null) 펀드는 AC/VC/PE 탭에서 제외된다.
    if (strategy) out = out.filter((f) => f.strategy_type === strategy)
    if (mineUserId) out = out.filter((f) => f.created_by === mineUserId || f.manager_id === mineUserId)
    return out
  }, [data, keyword, filters, strategy, mineUserId])

  // 검색·필터·스코프 변경 시 첫 페이지로 되돌리고 선택을 비운다(빈 페이지·유령 선택 방지).
  const filtersKey = JSON.stringify(filters)
  useEffect(() => {
    setPage(0)
    setSelected([])
  }, [keyword, filtersKey, strategy, mineUserId])

  const pageRows = filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE)

  const emptyText = strategy
    ? `${strategy} 유형으로 분류된 펀드가 없습니다. 펀드 등록·수정에서 유형구분을 지정하세요.`
    : '등록된 펀드가 없습니다.'

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="w-full sm:w-80">
          <Input
            placeholder="펀드명·대표펀드매니저 검색"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
        </div>
        <FundListFilters filters={filters} onChange={setFilters} />
        <div className="sm:ml-auto">
          <Button className="h-ctl-page" onClick={() => navigate('/fund/new')}>
            펀드 등록
          </Button>
        </div>
      </div>

      {isLoading ? (
        <Spinner />
      ) : (
        <FundListTable
          rows={pageRows}
          onRowClick={(f) => navigate(`/fund/${f.id}`)}
          selectedKeys={selected}
          onSelectionChange={setSelected}
          pagination={{ page, pageSize: PAGE_SIZE, total: filtered.length, onChange: setPage }}
          emptyText={emptyText}
        />
      )}
    </div>
  )
}
