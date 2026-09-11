import { Button, Input, Modal, useToast } from '@ynarcher/ui'
import { useState } from 'react'
import {
  restoreErrorMessage,
  useRestoreEntities,
  type InactiveLedgerKey,
  type InactiveLedgerRow,
} from '@/features/master/inactiveLedgerHooks'

const REASON_MAX = 30

interface Props {
  ledger: InactiveLedgerKey
  targets: InactiveLedgerRow[]
  bulk: boolean
  onClose: () => void
  onRestored: () => void
}

/** 단건은 사유를 받고, 선택 복구는 고정 사유 `일괄복구`로 처리하는 확인창. */
export function InactiveLedgerRestoreModal({ ledger, targets, bulk, onClose, onRestored }: Props) {
  const toast = useToast()
  const [reason, setReason] = useState('')
  const restore = useRestoreEntities(ledger)

  const confirm = async () => {
    const restoreReason = bulk ? '일괄복구' : reason.trim()
    if (!restoreReason) return
    try {
      const count = await restore.mutateAsync({
        ids: targets.map((target) => target.entity_id),
        reason: restoreReason,
      })
      toast.show(`${count}건을 복구했습니다.`, 'success')
      onRestored()
    } catch (error) {
      toast.show(restoreErrorMessage(error), 'danger')
    }
  }

  return (
    <Modal
      open
      onClose={() => !restore.isPending && onClose()}
      title={bulk ? '선택 원장 복구' : '원장 복구 사유'}
      help={
        bulk
          ? '선택한 원장을 한 번에 복구하며 변동 이력에는 “일괄복구”로 기록됩니다.'
          : '복구 사유는 변동 이력에 그대로 기록됩니다.'
      }
      size="sm"
      dismissible={false}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={restore.isPending}>
            취소
          </Button>
          <Button
            onClick={() => void confirm()}
            disabled={restore.isPending || (!bulk && !reason.trim())}
          >
            복구
          </Button>
        </>
      }
    >
      <div className="space-y-2">
        <p className="text-caption text-gray-600">
          {bulk ? (
            <>선택한 <b>{targets.length}건</b>을 활성 원장으로 복구합니다.</>
          ) : (
            <><b>{targets[0]?.entity_name}</b>을(를) 활성 원장으로 복구합니다.</>
          )}
        </p>
        {!bulk && (
          <>
            <Input
              autoFocus
              value={reason}
              maxLength={REASON_MAX}
              placeholder="예: 오등록 확인 후 복구"
              onChange={(event) => setReason(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void confirm()
              }}
            />
            <div className="text-right text-caption text-gray-600">
              {reason.length}/{REASON_MAX}
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}
