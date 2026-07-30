import { Button, DensityProvider, InfoField, InfoGrid, Modal } from '@ynarcher/ui'
import {
  CHECKOUT_LABELS,
  abilityOf,
  overdueDays,
  todayKey,
} from '@/features/office/checkouts/checkoutConfig'
import type { CheckoutAction } from '@/features/office/checkouts/CheckoutsTable'
import type { Checkout } from '@/features/office/checkouts/checkoutsApi'

interface CheckoutDetailModalProps {
  open: boolean
  row: Checkout | null
  branchNameOf: (id: string | null) => string | null
  nameOf: (id: string | null) => string | null
  viewer: { id?: string; isManager: boolean }
  busy: boolean
  onAction: (row: Checkout, action: CheckoutAction) => void
  onClose: () => void
}

/**
 * 반출 상세 — 표에 넣지 않은 것들(목적·행선지·비고와 처리 흔적)을 읽는 자리이며,
 * 표에서 하던 처리를 여기서도 그대로 할 수 있다.
 *
 * 처리 이력을 별도 이력 테이블로 두지 않았다 — 반출 한 건에 일어나는 일은 승인·반납 둘뿐이고,
 * 둘 다 "누가 언제"가 원장 한 행에 남는다. 이력 테이블은 그 한 행을 조회 두 번으로 나눌 뿐이다.
 */
export function CheckoutDetailModal({
  open,
  row,
  branchNameOf,
  nameOf,
  viewer,
  busy,
  onAction,
  onClose,
}: CheckoutDetailModalProps) {
  if (!row) return null

  const can = abilityOf(row, viewer)
  const late = overdueDays(row, todayKey())

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={row.assetName}
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            닫기
          </Button>
          {can.canCancel && (
            <Button variant="outline" onClick={() => onAction(row, 'CANCEL')} disabled={busy}>
              반출 취소
            </Button>
          )}
          {can.canApprove && (
            <>
              <Button
                variant="outline"
                className="text-danger hover:bg-danger-subtle hover:text-danger"
                onClick={() => onAction(row, 'REJECT')}
                disabled={busy}
              >
                반려
              </Button>
              <Button onClick={() => onAction(row, 'APPROVE')} disabled={busy}>
                승인
              </Button>
            </>
          )}
          {can.canStart && (
            <Button onClick={() => onAction(row, 'START')} disabled={busy}>
              반출 시작
            </Button>
          )}
          {can.canReturn && (
            <Button onClick={() => onAction(row, 'RETURN')} disabled={busy}>
              반납 처리
            </Button>
          )}
        </>
      }
    >
      <DensityProvider value="card">
        <div className="space-y-4">
          <InfoGrid columns={2}>
            <InfoField label="상태" value={CHECKOUT_LABELS[row.status]} />
            <InfoField label="지사" value={branchNameOf(row.branchId)} />
            <InfoField label="품목" value={row.assetItemType} />
            <InfoField label="시리얼 번호" value={row.assetSerialNo} />
            <InfoField label="반출자" value={row.createdByName} />
            <InfoField label="반출일" value={row.checkoutOn} />
            <InfoField
              label="반납 예정"
              value={late > 0 ? `${row.dueOn} (${late}일 경과)` : row.dueOn}
            />
            <InfoField label="실제 반납" value={row.returnedOn} />
          </InfoGrid>

          <InfoGrid columns={1}>
            <InfoField label="목적" value={row.purpose} />
            <InfoField label="행선지" value={row.destination} />
            <InfoField label="비고" value={row.note} />
          </InfoGrid>

          {/* 처리 흔적은 있을 때만 적는다 — 아직 일어나지 않은 일을 빈 칸으로 늘어놓지 않는다. */}
          {(row.decidedAt || row.returnedOn) && (
            <div className="rounded-radius-md border border-gray-200 bg-gray-25 px-3 py-2.5">
              <InfoGrid columns={1}>
                {row.decidedAt && (
                  <InfoField
                    label={row.status === 'REJECTED' ? '반려' : '승인'}
                    value={[nameOf(row.decidedBy), row.decidedAt.slice(0, 10), row.decisionNote]
                      .filter(Boolean)
                      .join(' · ')}
                  />
                )}
                {row.returnedOn && (
                  <InfoField
                    label="반납 처리"
                    value={[row.returnedByName, row.returnedOn, row.returnNote]
                      .filter(Boolean)
                      .join(' · ')}
                  />
                )}
              </InfoGrid>
            </div>
          )}
        </div>
      </DensityProvider>
    </Modal>
  )
}
