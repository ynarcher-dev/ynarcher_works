import { Spinner, useToast } from '@ynarcher/ui'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { EntityFormModal } from '@/features/networks/EntityFormModal'
import { DeactivateReasonModal } from '@/features/networks/DeactivateReasonModal'
import {
  recordContribution,
  useEntityPage,
  useUpdateEntity,
} from '@/features/networks/hooks'
import { ENTITIES } from '@/features/networks/config'
import { StartupPoolTable, type StartupPoolRow } from '@/features/startup/StartupPoolTable'

/** 목록 페이지당 행 수(서버 사이드 페이지네이션). */
const PAGE_SIZE = 30

interface StartupPoolTabProps {
  /** 상단 검색어(기업명 ilike). */
  keyword: string
  /** 등록 모달 제어(StartupPage 헤더 액션에서 소유). */
  creating?: boolean
  setCreating?: (c: boolean) => void
}

/**
 * 스타트업 풀 관리 탭 컨테이너: 발굴기업(startups) 데이터를 공용 StartupPoolTable에 공급한다.
 * 서버 페이지네이션·다중선택·등록/비활성화(사유 입력)를 소유하고, 표 자체는 공용 컴포넌트가 그린다.
 */
export function StartupPoolTab({ keyword, creating, setCreating }: StartupPoolTabProps) {
  const config = ENTITIES.startups
  const toast = useToast()
  const navigate = useNavigate()
  const update = useUpdateEntity('startups')
  const [page, setPage] = useState(0)
  const [selected, setSelected] = useState<string[]>([])
  const [deactivateTarget, setDeactivateTarget] = useState<StartupPoolRow | null>(null)
  const [deactivateBusy, setDeactivateBusy] = useState(false)

  // 검색어 변경 시 첫 페이지로 되돌리고 선택을 비운다(빈 페이지·유령 선택 방지).
  useEffect(() => {
    setPage(0)
    setSelected([])
  }, [keyword])

  const { data, isLoading } = useEntityPage('startups', keyword, page, PAGE_SIZE)

  // 비활성화 사유 확정 → 기여 로그(사유·행위자)를 먼저 남기고 soft-delete한다.
  const confirmDeactivate = async (reason: string) => {
    if (!deactivateTarget) return
    const target = deactivateTarget
    setDeactivateBusy(true)
    try {
      await recordContribution({
        table: 'startups',
        id: target.id,
        action: 'deactivated',
        source: 'manual',
        note: reason,
      })
      await update.mutateAsync({
        id: target.id,
        values: { deleted_at: new Date().toISOString() },
      })
      toast.show(`${config.label}을(를) 비활성화했습니다.`, 'success')
      setDeactivateTarget(null)
    } catch {
      toast.show('비활성화에 실패했습니다. 권한을 확인하세요.', 'danger')
    } finally {
      setDeactivateBusy(false)
    }
  }

  if (isLoading) return <Spinner />

  return (
    <div className="space-y-3">
      <StartupPoolTable
        rows={(data?.rows ?? []) as StartupPoolRow[]}
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

      {setCreating && (
        <EntityFormModal
          config={config}
          open={Boolean(creating)}
          onClose={() => setCreating(false)}
          initial={null}
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
