import { Button, Input, Modal, useToast } from '@ynarcher/ui'
import { useState } from 'react'
import { useCreateDeal } from '@/features/mna/hooks'

/** M&A 딜 신규 생성 모달(소싱 단계로 진입). */
export function DealFormModal({
  open,
  onClose,
  preset,
}: {
  open: boolean
  onClose: () => void
  preset?: { deal_name?: string; target_name?: string }
}) {
  const toast = useToast()
  const create = useCreateDeal()
  const [name, setName] = useState(preset?.deal_name ?? '')
  const [target, setTarget] = useState(preset?.target_name ?? '')
  const [value, setValue] = useState('')

  const onSubmit = async () => {
    if (!name.trim()) {
      toast.show('딜 명칭을 입력하세요.', 'warning')
      return
    }
    try {
      await create.mutateAsync({
        deal_name: name.trim(),
        target_name: target.trim() || null,
        estimated_value: value ? Number(value) : null,
      })
      toast.show('딜을 생성했습니다.', 'success')
      setName('')
      setTarget('')
      setValue('')
      onClose()
    } catch {
      toast.show('생성에 실패했습니다. 권한을 확인하세요.', 'danger')
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="신규 딜 생성"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            취소
          </Button>
          <Button onClick={() => void onSubmit()} disabled={create.isPending}>
            생성
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <label className="text-body font-medium text-gray-800">딜 명칭</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="text-body font-medium text-gray-800">대상 기업</label>
          <Input value={target} onChange={(e) => setTarget(e.target.value)} />
        </div>
        <div>
          <label className="text-body font-medium text-gray-800">
            거래 추정 가액(원)
          </label>
          <Input
            inputMode="numeric"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </div>
      </div>
    </Modal>
  )
}
