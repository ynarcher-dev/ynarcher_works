import { ListToolbar, Spinner } from '@ynarcher/ui'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ListActions } from '@/components/ListActions'
import { ENTITIES } from '@/features/networks/config'
import { useMaskPolicy } from '@/features/admin/sensitiveStore'
import { StartupPoolTable, type StartupPoolRow } from '@/features/startup/StartupPoolTable'
import { StartupPoolFilters } from '@/features/startup/StartupPoolFilters'
import {
  EMPTY_STARTUP_FILTERS,
  useStartupPoolPage,
  type StartupPoolFilters as Filters,
} from '@/features/startup/startupPoolHooks'
import {
  startupContentKey,
  type ManagementStatus,
} from '@/features/startup/startupClassification'

/** 목록 페이지당 행 수(서버 사이드 페이지네이션). */
const PAGE_SIZE = 30

interface StartupPoolTabProps {
  /** 탭 고정 구분(코드). 4개 메뉴(투자/보육/발굴/기타) 상호 배타 뷰. null이면 구분 무관 전체. */
  category: ManagementStatus | null
  /** 지정 시 담당자 또는 생성자가 이 사용자인 기업만 조회한다('내 관리기업'). */
  mineUserId?: string | null
}

/**
 * 스타트업 풀 관리 탭 컨테이너: 발굴기업(startups) 데이터를 공용 StartupPoolTable에 공급한다.
 * 검색어(다중 필드)·복수 필터·서버 페이지네이션·다중선택을 소유하고,
 * 검색창과 필터를 한 컨트롤 행으로 함께 배치한다. 신규 등록은 전용 등록 페이지에서 처리한다.
 * 비활성화(삭제)는 목록이 아니라 상세 페이지에서 수행한다.
 * (검색 상태는 탭 컨테이너가 소유 — 발굴기업 탭에서만 마운트되므로 탭 전환 시 자연히 초기화된다.)
 */
export function StartupPoolTab({ category, mineUserId }: StartupPoolTabProps) {
  const config = ENTITIES.startups
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
  // 구분 무관 목록은 '내 기업 관리'와 '전체 기업' 둘이라 범위로 정책 키가 갈린다.
  const contentKey = startupContentKey(category, mineUserId ? 'mine' : 'all')
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
    category,
    mineUserId ?? null,
    searchScope,
  )

  // 탭 전환 시 검색·필터·선택·페이지를 초기화한다(탭마다 다른 구분 뷰).
  useEffect(() => {
    setKeyword('')
    setFilters(EMPTY_STARTUP_FILTERS)
    setPage(0)
    setSelected([])
  }, [category, mineUserId])

  return (
    <div className="space-y-3">
      <ListToolbar
        keyword={keyword}
        onKeywordChange={setKeyword}
        // 검색되지 않는 필드를 안내에 적어 두면 "쳤는데 왜 안 나오나"가 되므로,
        // 자리표시자도 실제 검색 범위(정책에 따라 늘고 준다)를 그대로 읽어 만든다.
        searchPlaceholder={`${['기업명', '대표자', '사업자번호', '담당자', ...(searchScope.email ? ['이메일'] : []), ...(searchScope.phone ? ['연락처'] : [])].join('·')} 검색`}
        filters={
          <StartupPoolFilters filters={filters} onChange={setFilters} category={category} />
        }
        actions={
          <ListActions
            createLabel={`${config.label} 등록`}
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
