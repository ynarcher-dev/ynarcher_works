import { useToast } from '@ynarcher/ui'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MasterListView } from '@/features/master/MasterListView'
import type { MasterRow } from '@/features/master/types'
import { DeactivateReasonModal } from '@/features/networks/DeactivateReasonModal'
import { GLOBAL_COLUMNS } from '@/features/networks/globalConfig'
import { useDeactivateGlobal, useGlobalPage } from '@/features/networks/globalHooks'

/** 목록 페이지당 행 수(국내 디렉토리와 동일). */
const PAGE_SIZE = 30

interface Props {
  keyword: string
}

/**
 * 글로벌 네트워크 탭: 공용 리스트뷰(MasterListView) 재활용 + 비활성화.
 * 국내 8종과 달리 독립 단일 마스터(global_networks)이며, 권역·국가는 조인된 태그명으로 표시한다.
 * 등록/수정은 모달이 아닌 상세페이지(/networks/global/:id)에서 처리한다(다른 네트워크와 동일).
 */
export function GlobalNetworkTab({ keyword }: Props) {
  const toast = useToast()
  const navigate = useNavigate()
  const [page, setPage] = useState(0)
  const [deactivateTarget, setDeactivateTarget] = useState<MasterRow | null>(null)
  const [deactivateBusy, setDeactivateBusy] = useState(false)
  const deactivate = useDeactivateGlobal()

  useEffect(() => setPage(0), [keyword])
  const { data, isLoading } = useGlobalPage(keyword, page, PAGE_SIZE)

  const confirmDeactivate = async (reason: string) => {
    if (!deactivateTarget) return
    setDeactivateBusy(true)
    try {
      await deactivate.mutateAsync({ id: deactivateTarget.id, reason })
      toast.show('글로벌 네트워크를 비활성화했습니다.', 'success')
      setDeactivateTarget(null)
    } catch {
      toast.show('비활성화에 실패했습니다. 권한을 확인하세요.', 'danger')
    } finally {
      setDeactivateBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      <MasterListView
        label="글로벌 네트워크"
        columns={GLOBAL_COLUMNS}
        rows={(data?.rows ?? []) as MasterRow[]}
        isLoading={isLoading}
        onRowClick={(r) => navigate(`/networks/global/${r.id}`)}
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
