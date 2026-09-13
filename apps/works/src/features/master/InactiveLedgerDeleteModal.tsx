import { Banner, Button, Field, Input, Modal, Spinner, TextArea, useToast } from '@ynarcher/ui'
import { useMemo, useState } from 'react'
import {
  hardDeleteErrorMessage,
  useEntityDeleteBlockerRows,
  useHardDeleteEntities,
  type EntityDeleteBlockerRow,
  type InactiveLedgerKey,
  type InactiveLedgerRow,
} from '@/features/master/inactiveLedgerHooks'

const CONFIRM_PHRASE = '삭제합니다'
const REASON_MAX = 100

interface Props {
  /** 서버 capability가 물리 삭제를 연 원장만 받는다. */
  ledger: InactiveLedgerKey
  targets: InactiveLedgerRow[]
  bulk: boolean
  onClose: () => void
  onDeleted: (deletedCount: number) => void
}

interface BlockedTarget {
  target: InactiveLedgerRow
  reasons: EntityDeleteBlockerRow[]
}

/**
 * 되돌릴 수 없는 비활성 원장 물리 삭제 확인창.
 *
 * 선택 중 일부만 막혀 있을 때 선택 전체를 포기하게 두지 않는다 — **막히지 않은 행만 서버로
 * 보내고**, 막힌 행은 이름과 사유(연결 종류·건수)를 그대로 보여 준다. 다만 허가는 여전히
 * 서버가 준다: 삭제 RPC가 받은 행마다 같은 blocker를 다시 판정하고, 하나라도 막히면
 * 전부 롤백한다. 연결 조회 자체가 실패하면 안전을 위해 아무것도 보내지 않는다.
 */
export function InactiveLedgerDeleteModal({ ledger, targets, bulk, onClose, onDeleted }: Props) {
  const toast = useToast()
  const [reason, setReason] = useState('')
  const [typed, setTyped] = useState('')
  const ids = useMemo(() => targets.map((target) => target.entity_id), [targets])
  const { data: blockerRows, isLoading, isError } = useEntityDeleteBlockerRows(ledger, ids)
  const remove = useHardDeleteEntities(ledger)

  const { deletable, blocked } = useMemo(() => {
    const byEntity = new Map<string, EntityDeleteBlockerRow[]>()
    for (const row of blockerRows ?? []) {
      const found = byEntity.get(row.entity_id)
      if (found) found.push(row)
      else byEntity.set(row.entity_id, [row])
    }
    const deletableRows: InactiveLedgerRow[] = []
    const blockedRows: BlockedTarget[] = []
    for (const target of targets) {
      const reasons = byEntity.get(target.entity_id)
      if (reasons) blockedRows.push({ target, reasons })
      else deletableRows.push(target)
    }
    return { deletable: deletableRows, blocked: blockedRows }
  }, [blockerRows, targets])

  // 조회 실패는 "막힌 것이 없다"가 아니다. 확인되지 않은 행은 삭제 대상에서 뺀다.
  const deletableIds = isError ? [] : deletable.map((target) => target.entity_id)
  const partial = deletableIds.length > 0 && blocked.length > 0
  const matched = typed.replace(/^[\s.]+|[\s.]+$/g, '') === CONFIRM_PHRASE
  const subject = !bulk
    ? targets[0]?.entity_name
    : partial
      ? `삭제 가능한 ${deletableIds.length}건`
      : `선택한 원장 ${deletableIds.length}건`

  const submit = async () => {
    const deleteReason = bulk ? '일괄 영구 삭제' : reason.trim()
    if (deletableIds.length === 0 || !matched || !deleteReason) return
    try {
      const count = await remove.mutateAsync({
        ids: deletableIds,
        reason: deleteReason,
        confirmText: typed,
      })
      toast.show(
        blocked.length > 0
          ? `${count}건을 영구 삭제했습니다. ${blocked.length}건은 연결된 데이터가 있어 남겨 두었습니다.`
          : `${count}건을 영구 삭제했습니다.`,
        'success',
      )
      onDeleted(count)
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
            {deletableIds.length === 0 ? '닫기' : '취소'}
          </Button>
          {deletableIds.length > 0 && (
            <Button
              variant="danger"
              onClick={() => void submit()}
              disabled={isLoading || remove.isPending || !matched || (!bulk && !reason.trim())}
            >
              {partial ? `${deletableIds.length}건 영구 삭제` : '영구 삭제'}
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-3">
        {isLoading && (
          <div className="flex justify-center py-6"><Spinner /></div>
        )}

        {!isLoading && isError && (
          <Banner tone="warning">
            연결 데이터 확인에 실패해 안전을 위해 삭제를 막았습니다. 잠시 후 다시 시도하세요.
          </Banner>
        )}

        {!isLoading && !isError && deletableIds.length > 0 && (
          <Banner tone="danger">
            <strong>{subject}</strong>을(를) 원장에서 완전히 지웁니다. 이 작업은 되돌릴
            수 없습니다. 다시 사용할 가능성이 있다면 <strong>복구</strong>를 선택하세요.
          </Banner>
        )}

        {!isLoading && !isError && blocked.length > 0 && (
          <div className="rounded-radius-md border border-warning-border bg-warning-subtle px-3 py-2 shadow-soft">
            <div className="text-body font-semibold text-warning">
              {bulk
                ? `${blocked.length}건은 연결된 데이터가 있어 삭제할 수 없습니다.`
                : '연결된 데이터가 있어 삭제할 수 없습니다.'}
            </div>
            <ul className="mt-2 max-h-56 divide-y divide-gray-100 overflow-y-auto rounded-radius-sm border border-gray-200 bg-white">
              {blocked.map(({ target, reasons }) => (
                <li key={target.entity_id} className="px-2 py-1.5">
                  <div className="text-body font-medium text-gray-900">{target.entity_name}</div>
                  <div className="text-caption tabular-nums text-gray-600">
                    {reasons
                      .map((r) => `${r.blocker_label} ${Number(r.row_count).toLocaleString()}건`)
                      .join(' · ')}
                  </div>
                </li>
              ))}
            </ul>
            <div className="mt-2 text-caption text-warning">
              복구한 뒤 각 업무 화면에서 위 연결을 정리하고 다시 시도하세요.
            </div>
          </div>
        )}

        {!isLoading && !isError && deletableIds.length > 0 && (
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
