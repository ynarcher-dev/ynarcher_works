import { Button, Input, Modal, Select, useToast } from '@ynarcher/ui'
import { useEffect, useState } from 'react'
import {
  CAPITAL_CALL_STATUS_LABEL,
  CAPITAL_CALL_STATUS_OPTIONS,
} from '@/features/fund/fundListHooks'
import {
  useCreateCapitalCall,
  useUpdateCapitalCall,
  type CapitalCall,
} from '@/features/fund/hooks'

/**
 * 캐피탈 콜 차수(회차) 등록·수정 모달. 차수는 회차·납입 기한·상태만 갖는다 —
 * 금액(요청액)은 차수 아래 LP별 그리드에서 입력하며 차수 총액은 파생값이라 여기서 받지 않는다.
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
  const [status, setStatus] = useState('SCHEDULED')

  useEffect(() => {
    if (!open) return
    setCallNo(String(editing?.call_no ?? nextCallNo))
    setDueDate(editing?.due_date?.slice(0, 10) ?? '')
    setStatus(editing?.status ?? 'SCHEDULED')
  }, [open, editing, nextCallNo])

  const busy = create.isPending || update.isPending

  const onSubmit = async () => {
    const no = Number(callNo)
    if (!Number.isInteger(no) || no <= 0) {
      toast.show('회차를 1 이상 정수로 입력하세요.', 'warning')
      return
    }
    const values = { call_no: no, due_date: dueDate || null, status }
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
        <div className="sm:col-span-2">
          <label className="text-body font-medium text-gray-800">상태</label>
          <Select value={status} onChange={(e) => setStatus(e.target.value)}>
            {CAPITAL_CALL_STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {CAPITAL_CALL_STATUS_LABEL[o.value]}
              </option>
            ))}
          </Select>
        </div>
      </div>
    </Modal>
  )
}
