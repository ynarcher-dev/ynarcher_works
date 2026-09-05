import { ListToolbar, Spinner } from '@ynarcher/ui'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ListActions } from '@/components/ListActions'
import { ListScopeToggle } from '@/components/ListScopeToggle'
import { useMaskPolicy } from '@/features/admin/sensitiveStore'
import { StartupPoolTable, type StartupPoolRow } from '@/features/startup/StartupPoolTable'
import { StartupPoolFilters } from '@/features/startup/StartupPoolFilters'
import {
  StartupCategorySummary,
  StartupRegionSummary,
} from '@/features/startup/StartupFacetSummary'
import {
  EMPTY_STARTUP_FILTERS,
  useStartupPoolPage,
  type StartupPoolFilters as Filters,
} from '@/features/startup/startupPoolHooks'
import { startupListContentKey } from '@/features/startup/startupClassification'
import type { ListScope } from '@/lib/listScope'

/** 목록 페이지당 행 수(서버 사이드 페이지네이션). */
const PAGE_SIZE = 30

/** 표가 비었을 때·토글에서 부르는 원장 단위 이름. */
const ENTITY_NOUN = '스타트업'

interface StartupPoolTabProps {
  /** 'mine'은 담당자 또는 생성자가 나인 기업만, 'all'은 볼 수 있는 전부. */
  scope: ListScope
  onScopeChange: (scope: ListScope) => void
  /** 로그인 사용자 id. 'mine' 범위에서만 조회 조건으로 걸린다. */
  userId: string | null
}

/**
 * 스타트업 풀 관리 탭 컨테이너: 기업 원장(startups) 데이터를 공용 StartupPoolTable에 공급한다.
 * 검색어(다중 필드)·복수 필터·서버 페이지네이션·다중선택을 소유하고,
 * 검색창과 필터를 한 컨트롤 행으로 함께 배치한다. 신규 등록은 전용 등록 페이지에서 처리한다.
 * 비활성화(삭제)는 목록이 아니라 상세 페이지에서 수행한다.
 * 구분(투자·보육·발굴·미지정)은 진입 경로가 아니라 축이므로 이 컨테이너는 구분을 고정하지 않는다.
 */
export function StartupPoolTab({ scope, onScopeChange, userId }: StartupPoolTabProps) {
  const mineUserId = scope === 'mine' ? userId : null
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
  // 목록은 하나이고 범위(내 스타트업/전체 스타트업)로 정책 키가 갈린다(구분별 키는 상세가 쓴다).
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

  // 범위를 넓히거나 좁혀도 검색어·필터는 그대로 둔다 — 토글은 화면 이동이 아니라 같은 질문의
  // 범위를 바꾸는 일이라, 걸어 둔 조건을 매번 다시 걸게 하면 토글을 누를 이유가 없어진다.
  // 되돌리는 것은 페이지 번호와 선택뿐이다(넓힌 목록의 3페이지는 방금 보던 그 3페이지가 아니고,
  // 목록에서 사라진 행의 선택이 남으면 일괄 작업이 보이지 않는 행에 걸린다).
  useEffect(() => {
    setPage(0)
    setSelected([])
  }, [scope])

  return (
    <div className="space-y-3">
      {/*
        요약 카드 두 줄이 구분·권역 축을 소유한다(2026-09-05). 순서는 좁혀 가는 순서다 —
        먼저 '우리와 어떤 관계인 기업인가'(구분)를 고르고, 그다음 '어디에 있나'(권역)를
        고른다. 두 축이 카드로 간 만큼 필터 줄에서는 같은 값을 묻는 칩(구분·단계 중 구분)을
        걷었다 — 같은 물음에 컨트롤이 둘이면 엇갈리게 걸 수 있고 그때 결과가 빈 이유를
        화면이 답하지 못한다. 소재지 칩은 권역의 아래 단이라 그대로 남는다.
      */}
      <StartupCategorySummary
        keyword={keyword}
        filters={filters}
        mineUserId={mineUserId}
        searchScope={searchScope}
        onChange={(next) => setFilters((f) => ({ ...f, categories: next.values }))}
      />

      <StartupRegionSummary
        keyword={keyword}
        filters={filters}
        mineUserId={mineUserId}
        searchScope={searchScope}
        onChange={(next) =>
          setFilters((f) => ({ ...f, regions: next.values, regionUnset: next.unset }))
        }
      />

      <ListToolbar
        // 필터 축 넷에 범위 토글까지 서므로 검색창을 한 단 좁힌다(액션이 아랫줄로 밀리지 않게).
        dense
        keyword={keyword}
        onKeywordChange={setKeyword}
        // 검색되지 않는 필드를 안내에 적어 두면 "쳤는데 왜 안 나오나"가 되므로,
        // 자리표시자도 실제 검색 범위(정책에 따라 늘고 준다)를 그대로 읽어 만든다.
        searchPlaceholder={`${['기업명', '대표자', '사업자번호', '담당자', ...(searchScope.email ? ['이메일'] : []), ...(searchScope.phone ? ['연락처'] : [])].join('·')} 검색`}
        filters={<StartupPoolFilters filters={filters} onChange={setFilters} />}
        actions={
          <ListActions
            leading={
              <ListScopeToggle scope={scope} onChange={onScopeChange} noun={ENTITY_NOUN} />
            }
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
