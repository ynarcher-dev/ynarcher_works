import { Banner, Button, Field, Input, Modal, Spinner, TextArea, useToast } from '@ynarcher/ui'
import { useState } from 'react'
import {
  hardDeleteErrorMessage,
  useEntityDeleteBlockers,
  useHardDeleteEntities,
  type InactiveLedgerKey,
  type InactiveLedgerRow,
} from '@/features/master/inactiveLedgerHooks'

const CONFIRM_PHRASE = '삭제합니다'
const REASON_MAX = 100

interface Props {
  ledger: InactiveLedgerKey
  targets: InactiveLedgerRow[]
  bulk: boolean
  onClose: () => void
  onDeleted: () => void
}

/** 되돌릴 수 없는 비활성 원장 물리 삭제 확인창. 서버도 같은 세 관문을 다시 검사한다. */
export function InactiveLedgerDeleteModal({ ledger, targets, bulk, onClose, onDeleted }: Props) {
  const toast = useToast()
  const [reason, setReason] = useState('')
  const [typed, setTyped] = useState('')
  const ids = targets.map((target) => target.entity_id)
  const subject = bulk ? `선택한 원장 ${targets.length}건` : targets[0]?.entity_name
  const { data: blockers, isLoading, isError } = useEntityDeleteBlockers(ledger, ids)
  const remove = useHardDeleteEntities(ledger)
  const blocked = isError || (blockers?.length ?? 0) > 0
  const matched = typed.replace(/^[\s.]+|[\s.]+$/g, '') === CONFIRM_PHRASE

  const submit = async () => {
    const deleteReason = bulk ? '일괄삭제' : reason.trim()
    if (blocked || !matched || !deleteReason) return
    try {
      const count = await remove.mutateAsync({
        ids,
        reason: deleteReason,
        confirmText: typed,
      })
      toast.show(`${count}건을 영구 삭제했습니다.`, 'success')
      onDeleted()
    } catch (error) {
      toast.show(hardDeleteErrorMessage(error), 'danger')
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="비활성 원장 영구 삭제"
      size="md"
      dismissible={false}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={remove.isPending}>
            취소
          </Button>
          <Button
            variant="danger"
            onClick={() => void submit()}
            disabled={
              blocked || isLoading || remove.isPending || !matched || (!bulk && !reason.trim())
            }
          >
            영구 삭제
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Banner tone="danger">
          <strong>{subject}</strong>을(를) 원장에서 완전히 지웁니다. 이 작업은 되돌릴
          수 없습니다. 다시 사용할 가능성이 있다면 <strong>복구</strong>를 선택하세요.
        </Banner>

        {isLoading && <Spinner />}

        {!isLoading && blocked && (
          <Banner tone="warning">
            {isError ? (
              '연결 데이터 확인에 실패해 안전을 위해 삭제를 막았습니다. 잠시 후 다시 시도하세요.'
            ) : (
              <>
                <div className="mb-1 font-semibold">연결된 데이터가 있어 삭제할 수 없습니다.</div>
                <ul className="list-disc space-y-0.5 pl-4">
                  {(blockers ?? []).map((blocker) => (
                    <li key={blocker.blocker_key} className="tabular-nums">
                      {blocker.blocker_label} {Number(blocker.row_count).toLocaleString()}건
                    </li>
                  ))}
                </ul>
                <div className="mt-1">
                  복구한 뒤 각 업무 화면에서 연결을 정리하고 다시 시도하세요.
                </div>
              </>
            )}
          </Banner>
        )}

        {!isLoading && !blocked && (
          <>
            {!bulk && (
              <Field label="삭제 사유" required>
                <TextArea
                  autoFocus
                  rows={3}
                  value={reason}
                  maxLength={REASON_MAX}
                  placeholder="영구 삭제가 필요한 이유를 입력하세요."
                  onChange={(event) => setReason(event.target.value)}
                />
              </Field>
            )}
            <Field
              label="확인 문구"
              required
              hint={`삭제하려면 “${CONFIRM_PHRASE}”를 입력하세요.`}
              error={typed.length > 0 && !matched ? '문구가 일치하지 않습니다.' : undefined}
            >
              <Input
                autoFocus={bulk}
                value={typed}
                placeholder={CONFIRM_PHRASE}
                invalid={typed.length > 0 && !matched}
                onChange={(event) => setTyped(event.target.value)}
              />
            </Field>
          </>
        )}
      </div>
    </Modal>
  )
}
