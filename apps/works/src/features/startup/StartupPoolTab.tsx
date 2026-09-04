import { ListToolbar, Spinner } from '@ynarcher/ui'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ListActions } from '@/components/ListActions'
import { useMaskPolicy } from '@/features/admin/sensitiveStore'
import { StartupPoolTable, type StartupPoolRow } from '@/features/startup/StartupPoolTable'
import { StartupPoolFilters } from '@/features/startup/StartupPoolFilters'
import { StartupFilteredSummary } from '@/features/startup/StartupFilteredSummary'
import {
  EMPTY_STARTUP_FILTERS,
  useStartupPoolPage,
  type StartupPoolFilters as Filters,
} from '@/features/startup/startupPoolHooks'
import { startupListContentKey } from '@/features/startup/startupClassification'
import { toggleAxisValue } from '@/lib/filterAxis'

/** 목록 페이지당 행 수(서버 사이드 페이지네이션). */
const PAGE_SIZE = 30

interface StartupPoolTabProps {
  /** 지정 시 담당자 또는 생성자가 이 사용자인 기업만 조회한다('내 관리기업'). */
  mineUserId?: string | null
}

/**
 * 스타트업 풀 관리 탭 컨테이너: 기업 원장(startups) 데이터를 공용 StartupPoolTable에 공급한다.
 * 검색어(다중 필드)·복수 필터·서버 페이지네이션·다중선택을 소유하고,
 * 검색창과 필터를 한 컨트롤 행으로 함께 배치한다. 신규 등록은 전용 등록 페이지에서 처리한다.
 * 비활성화(삭제)는 목록이 아니라 상세 페이지에서 수행한다.
 * 구분(투자·보육·발굴·기타)은 진입 경로가 아니라 필터 축이므로 이 컨테이너는 구분을 고정하지 않는다.
 */
export function StartupPoolTab({ mineUserId }: StartupPoolTabProps) {
  const navigate = useNavigate()
  const [keyword, setKeyword] = useState('')
  const [page, setPage] = useState(0)
  const [selected, setSelected] = useState<string[]>([])
  const [filters, setFilters] = useState<Filters>(EMPTY_STARTUP_FILTERS)

  // 검색어·필터 변경 시 첫 페이지로 되돌리고 선택을 비운다(빈 페이지·유령 선택 방지).
  const filtersKey = JSON.stringify(filters)
  useEffect(() => {
    setPage(0)
    setSelected([])
  }, [keyword, filtersKey])

  // 검색 가능 범위는 이 목록의 마스킹 정책이 정한다 — 가려진 필드는 검색어로도 잡지 않는다.
  // 목록은 '내 업로드 DB'와 '스타트업 DB' 둘뿐이라 범위로 정책 키가 갈린다(구분별 키는 상세가 쓴다).
  const contentKey = startupListContentKey(mineUserId ? 'mine' : 'all')
  const masked = useMaskPolicy(contentKey)
  const searchScope = useMemo(
    () => ({ email: !masked.email, phone: !masked.phone }),
    [masked.email, masked.phone],
  )

  const { data, isLoading } = useStartupPoolPage(
    keyword,
    filters,
    page,
    PAGE_SIZE,
    mineUserId ?? null,
    searchScope,
  )

  // 탭 전환 시 검색·필터·선택·페이지를 초기화한다('내 업로드 DB' ↔ '스타트업 DB'는 범위가 다른 뷰다).
  useEffect(() => {
    setKeyword('')
    setFilters(EMPTY_STARTUP_FILTERS)
    setPage(0)
    setSelected([])
  }, [mineUserId])

  return (
    <div className="space-y-3">
      <StartupFilteredSummary
        keyword={keyword}
        filters={filters}
        mineUserId={mineUserId}
        searchScope={searchScope}
        onToggleCategory={(category) =>
          setFilters((f) => ({ ...f, categories: toggleAxisValue(f.categories, category) }))
        }
        onClearCategories={() => setFilters((f) => ({ ...f, categories: [] }))}
      />

      <ListToolbar
        keyword={keyword}
        onKeywordChange={setKeyword}
        // 검색되지 않는 필드를 안내에 적어 두면 "쳤는데 왜 안 나오나"가 되므로,
        // 자리표시자도 실제 검색 범위(정책에 따라 늘고 준다)를 그대로 읽어 만든다.
        searchPlaceholder={`${['기업명', '대표자', '사업자번호', '담당자', ...(searchScope.email ? ['이메일'] : []), ...(searchScope.phone ? ['연락처'] : [])].join('·')} 검색`}
        filters={<StartupPoolFilters filters={filters} onChange={setFilters} />}
        actions={
          <ListActions
            createLabel="스타트업 등록"
            onCreate={() => navigate('/startup/discovered/new')}
            bulkTo="/startup/bulk"
          />
        }
      />

      {isLoading ? (
        <Spinner />
      ) : (
      <StartupPoolTable
        rows={(data?.rows ?? []) as StartupPoolRow[]}
        contentKey={contentKey}
        selectedKeys={selected}
        onSelectionChange={setSelected}
        onRowClick={(row) => navigate(`/startup/discovered/${row.id}`)}
        pagination={{
          page,
          pageSize: PAGE_SIZE,
          total: data?.total ?? 0,
          totalAll: data?.totalAll ?? 0,
          onChange: setPage,
        }}
      />
      )}
    </div>
  )
}
