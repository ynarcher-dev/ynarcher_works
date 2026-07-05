import { Button, Input, Modal, Select, useToast } from '@ynarcher/ui'
import { useState } from 'react'
import { useCreateFund } from '@/features/fund/hooks'

const STATUS = ['RAISING', 'OPERATING', 'LIQUIDATING', 'CLOSED']

/** 펀드 등록 모달. */
export function FundFormModal({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const toast = useToast()
  const create = useCreateFund()
  const [name, setName] = useState('')
  const [commitment, setCommitment] = useState('')
  const [status, setStatus] = useState('RAISING')

  const onSubmit = async () => {
    if (!name.trim()) {
      toast.show('펀드명을 입력하세요.', 'warning')
      return
    }
    try {
      await create.mutateAsync({
        name: name.trim(),
        total_commitment: Number(commitment) || 0,
        status,
      })
      toast.show('펀드를 등록했습니다.', 'success')
      setName('')
      setCommitment('')
      onClose()
    } catch {
      toast.show('등록에 실패했습니다. 권한을 확인하세요.', 'danger')
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="펀드 등록"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            취소
          </Button>
          <Button onClick={() => void onSubmit()} disabled={create.isPending}>
            등록
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <label className="text-body font-medium text-gray-800">펀드명</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="text-body font-medium text-gray-800">결성액</label>
          <Input
            inputMode="numeric"
            value={commitment}
            onChange={(e) => setCommitment(e.target.value)}
          />
        </div>
        <div>
          <label className="text-body font-medium text-gray-800">상태</label>
          <Select value={status} onChange={(e) => setStatus(e.target.value)}>
            {STATUS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </div>
      </div>
    </Modal>
  )
}
