import { Banner, Button, Input, Modal, useToast } from '@ynarcher/ui'
import { useEffect, useState } from 'react'
import {
  useCreateCapitalCall,
  useUpdateCapitalCall,
  type CapitalCall,
} from '@/features/fund/hooks'

/**
 * 캐피탈 콜 차수(회차) 등록·수정 모달. 차수는 회차·납입 기한만 갖는다 —
 * 금액(요청액)과 상태는 차수 아래 LP별 그리드에서 정해지는 파생값이라 여기서 받지 않는다.
 * 같은 차수라도 LP마다 통지·납입·연체가 갈리므로 상태의 소유자는 LP 행이다.
 * (근거: docs_planning/3_5_workspace_fund.md §1.3)
 */
export function CapitalCallFormModal({
  fundId,
  open,
  onClose,
  editing,
  nextCallNo,
}: {
  fundId: string
  open: boolean
  onClose: () => void
  /** 수정 대상. 없으면 신규 등록. */
  editing?: CapitalCall | null
  /** 신규 등록 시 기본 회차(현재 최대 회차 + 1). */
  nextCallNo: number
}) {
  const toast = useToast()
  const create = useCreateCapitalCall(fundId)
  const update = useUpdateCapitalCall(fundId)

  const [callNo, setCallNo] = useState('1')
  const [dueDate, setDueDate] = useState('')

  useEffect(() => {
    if (!open) return
    setCallNo(String(editing?.call_no ?? nextCallNo))
    setDueDate(editing?.due_date?.slice(0, 10) ?? '')
  }, [open, editing, nextCallNo])

  const busy = create.isPending || update.isPending

  const onSubmit = async () => {
    const no = Number(callNo)
    if (!Number.isInteger(no) || no <= 0) {
      toast.show('회차를 1 이상 정수로 입력하세요.', 'warning')
      return
    }
    const values = { call_no: no, due_date: dueDate || null }
    try {
      if (editing) {
        await update.mutateAsync({ id: editing.id, values })
        toast.show('차수를 수정했습니다.', 'success')
      } else {
        await create.mutateAsync(values)
        toast.show('차수를 등록했습니다.', 'success')
      }
      onClose()
    } catch {
      toast.show('저장에 실패했습니다. 권한을 확인하세요.', 'danger')
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title={editing ? '캐피탈 콜 차수 수정' : '캐피탈 콜 차수 등록'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            취소
          </Button>
          <Button onClick={() => void onSubmit()} disabled={busy}>
            {editing ? '수정' : '등록'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="text-body font-medium text-gray-800">회차</label>
            <Input
              inputMode="numeric"
              value={callNo}
              onChange={(e) => setCallNo(e.target.value.replace(/[^\d]/g, ''))}
              className="text-right tabular-nums"
            />
          </div>
          <div>
            <label className="text-body font-medium text-gray-800">납입 기한</label>
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
        </div>
        <Banner tone="info">
          상태는 차수가 아니라 출자자(LP)별로 지정합니다. 등록 후 표에서 LP마다 예정·통지·납입완료·연체를
          고르면 차수 상태는 그 분포에서 자동 계산됩니다.
        </Banner>
      </div>
    </Modal>
  )
}
