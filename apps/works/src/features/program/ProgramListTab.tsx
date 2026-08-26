import { ListToolbar, Spinner } from '@ynarcher/ui'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/auth/authStore'
import { ListActions } from '@/components/ListActions'
import { ProgramFormModal } from '@/features/program/ProgramFormModal'
import { ProgramFilters } from '@/features/program/ProgramFilters'
import { ProgramPipeline } from '@/features/program/ProgramPipeline'
import { ProgramTable } from '@/features/program/ProgramTable'
import {
  EMPTY_PROGRAM_FILTERS,
  useProgramsPage,
  type ProgramFilters as Filters,
} from '@/features/program/programsPoolHooks'
import { useProgramWorkspace } from '@/features/program/workspace'
import { toggleAxisValue } from '@/lib/filterAxis'

/** 목록 페이지당 행 수(서버 사이드 페이지네이션). */
const PAGE_SIZE = 30

interface ProgramListTabProps {
  /** 'mine' = 내가 담당자/생성자인 사업만, 'all' = 전체 사업. */
  scope: 'mine' | 'all'
  /** 상세 진입 시 넘길 출처 탭. 뒤로가기·사이드바 활성 상태 복원에 쓴다. */
  backTab: string
}

/**
 * 사업 워크스페이스(AC/M&A/PROJECT 공용): 사업 원장 목록.
 * 검색어(사업명·생성자)·복수 필터(상태·사업구분·부서·시작일)·서버 페이지네이션·다중선택을
 * 소유하고, 검색창과 필터를 한 컨트롤 행으로 함께 배치한다. (STARTUP StartupPoolTab과 동일 구조.)
 * 비활성화(삭제)는 목록이 아니라 상세 페이지에서 수행한다.
 * scope='mine'이면 생성자(created_by)·담당자가 현재 사용자인 사업만 조회한다.
 *
 * 진행 현황 프로세스 뷰는 두 스코프 모두에 둔다. 종전에는 '내 사업'에만 두었는데,
 * 검색어·필터가 집계에 반영되면서 전체 목록에서도 "지금 좁혀 놓은 범위가 어느 단계에
 * 몰려 있나"라는 같은 질문이 성립한다 — 더는 '회사 전체 통계' 한 장이 아니다.
 */
export function ProgramListTab({ scope, backTab }: ProgramListTabProps) {
  const config = useProgramWorkspace()
  const navigate = useNavigate()
  const userId = useAuthStore((s) => s.user?.id)
  const [keyword, setKeyword] = useState('')
  const [page, setPage] = useState(0)
  const [selected, setSelected] = useState<string[]>([])
  const [filters, setFilters] = useState<Filters>(EMPTY_PROGRAM_FILTERS)
  const [creating, setCreating] = useState(false)

  // 검색어·필터 변경 시 첫 페이지로 되돌리고 선택을 비운다(빈 페이지·유령 선택 방지).
  const filtersKey = JSON.stringify(filters)
  useEffect(() => {
    setPage(0)
    setSelected([])
  }, [keyword, filtersKey])

  const mineUserId = scope === 'mine' ? userId ?? null : null
  const { data, isLoading } = useProgramsPage(keyword, filters, page, PAGE_SIZE, mineUserId)

  /** 단계 토글: 이미 걸린 상태면 빼고, 아니면 더한다(상태 필터와 같은 다중선택 규약). */
  const toggleStatus = (status: string) =>
    setFilters((f) => ({ ...f, statuses: toggleAxisValue(f.statuses, status) }))

  return (
    <div className="space-y-3">
      <ProgramPipeline
        mineUserId={mineUserId}
        keyword={keyword}
        filters={filters}
        onToggleStatus={toggleStatus}
        onClearStatuses={() => setFilters((f) => ({ ...f, statuses: [] }))}
      />

      <ListToolbar
        keyword={keyword}
        onKeywordChange={setKeyword}
        // 워크스페이스마다 부르는 이름이 다르다(AC 사업 / M&A·PROJECT 프로젝트).
        searchPlaceholder={`${config.entityNoun}명·생성자 검색`}
        filters={<ProgramFilters filters={filters} onChange={setFilters} />}
        actions={
          <ListActions
            createLabel={`${config.entityNoun} 등록`}
            onCreate={() => setCreating(true)}
            bulkTo={`${config.basePath}/bulk`}
          />
        }
      />

      {isLoading ? (
        <Spinner />
      ) : (
        <ProgramTable
          rows={data?.rows ?? []}
          selectedKeys={selected}
          onSelectionChange={setSelected}
          // 출처 목록 탭(mine/all/카테고리)을 쿼리로 넘겨 상세에서 사이드바 활성·뒤로가기 목적지를 유지한다.
          onRowClick={(row) => navigate(`${config.basePath}/programs/${row.id}?tab=${backTab}`)}
          pagination={{
            page,
            pageSize: PAGE_SIZE,
            total: data?.total ?? 0,
            totalAll: data?.totalAll ?? 0,
            onChange: setPage,
          }}
        />
      )}

      <ProgramFormModal open={creating} onClose={() => setCreating(false)} />
    </div>
  )
}
