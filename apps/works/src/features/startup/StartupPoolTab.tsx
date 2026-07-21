import { Button, Input, Spinner, useToast } from '@ynarcher/ui'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { DeactivateReasonModal } from '@/features/networks/DeactivateReasonModal'
import { useDeactivateEntity } from '@/features/networks/hooks'
import { ENTITIES } from '@/features/networks/config'
import { StartupPoolTable, type StartupPoolRow } from '@/features/startup/StartupPoolTable'
import { StartupPoolFilters } from '@/features/startup/StartupPoolFilters'
import {
  EMPTY_STARTUP_FILTERS,
  useStartupPoolPage,
  type StartupPoolFilters as Filters,
} from '@/features/startup/startupPoolHooks'
import type { ManagementStatus } from '@/features/startup/startupClassification'

/** 목록 페이지당 행 수(서버 사이드 페이지네이션). */
const PAGE_SIZE = 30

interface StartupPoolTabProps {
  /** 탭 고정 구분(코드). 4개 메뉴(투자/보육/발굴/기타) 상호 배타 뷰. null이면 구분 무관 전체. */
  category: ManagementStatus | null
  /** 지정 시 담당자 또는 등록자가 이 사용자인 기업만 조회한다('내 관리기업'). */
  mineUserId?: string | null
}

/**
 * 스타트업 풀 관리 탭 컨테이너: 발굴기업(startups) 데이터를 공용 StartupPoolTable에 공급한다.
 * 검색어(다중 필드)·복수 필터·서버 페이지네이션·다중선택·비활성화(사유 입력)를 소유하고,
 * 검색창과 필터를 한 컨트롤 행으로 함께 배치한다. 신규 등록은 전용 등록 페이지에서 처리한다.
 * (검색 상태는 탭 컨테이너가 소유 — 발굴기업 탭에서만 마운트되므로 탭 전환 시 자연히 초기화된다.)
 */
export function StartupPoolTab({ category, mineUserId }: StartupPoolTabProps) {
  const config = ENTITIES.startups
  const toast = useToast()
  const navigate = useNavigate()
  const deactivate = useDeactivateEntity('startups')
  const [keyword, setKeyword] = useState('')
  const [page, setPage] = useState(0)
  const [selected, setSelected] = useState<string[]>([])
  const [filters, setFilters] = useState<Filters>(EMPTY_STARTUP_FILTERS)
  const [deactivateTarget, setDeactivateTarget] = useState<StartupPoolRow | null>(null)
  const [deactivateBusy, setDeactivateBusy] = useState(false)

  // 검색어·필터 변경 시 첫 페이지로 되돌리고 선택을 비운다(빈 페이지·유령 선택 방지).
  const filtersKey = JSON.stringify(filters)
  useEffect(() => {
    setPage(0)
    setSelected([])
  }, [keyword, filtersKey])

  const { data, isLoading } = useStartupPoolPage(
    keyword,
    filters,
    page,
    PAGE_SIZE,
    category,
    mineUserId ?? null,
  )

  // 탭 전환 시 검색·필터·선택·페이지를 초기화한다(탭마다 다른 구분 뷰).
  useEffect(() => {
    setKeyword('')
    setFilters(EMPTY_STARTUP_FILTERS)
    setPage(0)
    setSelected([])
  }, [category, mineUserId])

  // 비활성화 사유 확정 → 사유를 트랜잭션 컨텍스트에 실어 주는 RPC 경유(20260721150000).
  // 원장 UPDATE와 사유 기록이 한 트랜잭션에 묶여, 종전처럼 '비활성화 기록만 남고 행은 살아 있는'
  // 어긋난 상태가 생기지 않는다.
  const confirmDeactivate = async (reason: string) => {
    if (!deactivateTarget) return
    const target = deactivateTarget
    setDeactivateBusy(true)
    try {
      await deactivate.mutateAsync({ id: target.id, reason })
      toast.show(`${config.label}을(를) 비활성화했습니다.`, 'success')
      setDeactivateTarget(null)
    } catch {
      toast.show('비활성화에 실패했습니다. 권한을 확인하세요.', 'danger')
    } finally {
      setDeactivateBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="w-full sm:w-80">
          <Input
            placeholder="기업명·대표자·사업자번호·등록자 검색"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
        </div>
        <StartupPoolFilters filters={filters} onChange={setFilters} />
        <div className="sm:ml-auto">
          <Button className="h-ctl-page" onClick={() => navigate('/startup/discovered/new')}>
            {config.label} 등록
          </Button>
        </div>
      </div>

      {isLoading ? (
        <Spinner />
      ) : (
      <StartupPoolTable
        rows={(data?.rows ?? []) as StartupPoolRow[]}
        // 구분 무관 목록('내 관리기업')은 undefined로 넘겨 담당자·구분 컬럼을 모두 노출한다.
        tab={category ?? undefined}
        selectedKeys={selected}
        onSelectionChange={setSelected}
        onRowClick={(row) => navigate(`/startup/discovered/${row.id}`)}
        onDeactivate={(row) => setDeactivateTarget(row)}
        deactivateWithReason
        pagination={{
          page,
          pageSize: PAGE_SIZE,
          total: data?.total ?? 0,
          totalAll: data?.totalAll ?? 0,
          onChange: setPage,
        }}
      />
      )}

      {deactivateTarget && (
        <DeactivateReasonModal
          open
          name={deactivateTarget.name}
          busy={deactivateBusy}
          onCancel={() => setDeactivateTarget(null)}
          onConfirm={(reason) => void confirmDeactivate(reason)}
        />
      )}
    </div>
  )
}
