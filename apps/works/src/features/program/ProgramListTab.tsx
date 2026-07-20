import { Button, Input, Spinner, useToast } from '@ynarcher/ui'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/auth/authStore'
import { ProgramFormModal } from '@/features/program/ProgramFormModal'
import { ProgramFilters } from '@/features/program/ProgramFilters'
import { ProgramTable } from '@/features/program/ProgramTable'
import {
  EMPTY_PROGRAM_FILTERS,
  useDeactivateProgram,
  useProgramsPage,
  type ProgramFilters as Filters,
} from '@/features/program/programsPoolHooks'
import type { Program } from '@/features/program/hooks'
import { useProgramWorkspace } from '@/features/program/workspace'

/** 목록 페이지당 행 수(서버 사이드 페이지네이션). */
const PAGE_SIZE = 30

interface ProgramListTabProps {
  /** 'mine' = 내가 담당자/등록자인 사업만, 'all' = 전체 사업. */
  scope: 'mine' | 'all'
}

/**
 * 사업 워크스페이스(AC/M&A/PROJECT 공용): 사업 원장 목록.
 * 검색어(사업명·등록자)·복수 필터(상태·시작일)·서버 페이지네이션·다중선택·비활성화를 소유하고,
 * 검색창과 필터를 한 컨트롤 행으로 함께 배치한다. (STARTUP StartupPoolTab과 동일 구조.)
 * scope='mine'이면 등록자(created_by)·담당자가 현재 사용자인 사업만 조회한다.
 */
export function ProgramListTab({ scope }: ProgramListTabProps) {
  const config = useProgramWorkspace()
  const toast = useToast()
  const navigate = useNavigate()
  const userId = useAuthStore((s) => s.user?.id)
  const deactivate = useDeactivateProgram()
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
  const { data, isLoading } = useProgramsPage(
    keyword,
    filters,
    page,
    PAGE_SIZE,
    mineUserId,
  )

  const onDeactivate = async (row: Program) => {
    try {
      await deactivate.mutateAsync(row.id)
      toast.show('사업을 비활성화했습니다.', 'success')
    } catch {
      toast.show('비활성화에 실패했습니다. 권한을 확인하세요.', 'danger')
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="w-full sm:w-80">
          <Input
            placeholder="사업명·등록자 검색"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
        </div>
        <ProgramFilters filters={filters} onChange={setFilters} />
        <div className="sm:ml-auto">
          <Button className="h-11" onClick={() => setCreating(true)}>
            사업 등록
          </Button>
        </div>
      </div>

      {isLoading ? (
        <Spinner />
      ) : (
        <ProgramTable
          rows={data?.rows ?? []}
          selectedKeys={selected}
          onSelectionChange={setSelected}
          // 출처 목록 탭(mine/all)을 쿼리로 넘겨 상세에서 사이드바 활성·뒤로가기 목적지를 유지한다.
          onRowClick={(row) => navigate(`${config.basePath}/programs/${row.id}?tab=${scope}`)}
          onDeactivate={(row) => void onDeactivate(row)}
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
