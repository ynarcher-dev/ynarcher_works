import { Button, useToast } from '@ynarcher/ui'
import {
  useBulkDeactivateEntities,
  type InactiveLedgerKey,
} from '@/features/master/inactiveLedgerHooks'

interface Props {
  ledger: InactiveLedgerKey
  noun: string
  selectedIds: string[]
  onDone: () => void
}

/** 공용 DB 목록에서 체크한 현재 페이지 행을 한 번에 비활성화하는 선택 액션 줄. */
export function LedgerBulkDeactivateBar({ ledger, noun, selectedIds, onDone }: Props) {
  const toast = useToast()
  const deactivate = useBulkDeactivateEntities(ledger)
  if (selectedIds.length === 0) return null

  const run = async () => {
    if (!window.confirm(`선택한 ${noun} ${selectedIds.length}건을 비활성화하시겠습니까?`)) return
    try {
      const count = await deactivate.mutateAsync({ ids: selectedIds, reason: '일괄삭제' })
      toast.show(`${count}건을 비활성화했습니다.`, 'success')
      onDone()
    } catch {
      toast.show('일괄 비활성화에 실패했습니다. 대상과 권한을 확인하세요.', 'danger')
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-radius-md border border-brand-200 bg-brand-50 px-3 py-2">
      <span className="text-body font-semibold text-gray-900">
        {selectedIds.length}건 선택
      </span>
      <div className="ml-auto">
        <Button
          variant="outline-danger"
          onClick={() => void run()}
          disabled={deactivate.isPending}
        >
          일괄 비활성화
        </Button>
      </div>
    </div>
  )
}
