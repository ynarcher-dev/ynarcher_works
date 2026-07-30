import { Button, DensityProvider, InfoField, Modal, cardText, cn } from '@ynarcher/ui'
import { useEffect, useMemo, useState } from 'react'
// 사진 서명은 자산 원장이 소유한 헬퍼를 그대로 쓴다 — 같은 버킷을 두 곳에서 다르게 다루면
// 만료 시간과 실패 처리가 갈린다(조회 권한은 내부 임직원으로 열려 있다).
import { useAssetPhotoUrls } from '@/features/management/assets/assetPhotos'
import { AssetPhotoCarousel } from '@/features/office/checkouts/AssetPhotoCarousel'
import { CheckoutFormView } from '@/features/office/checkouts/CheckoutFormView'
import type { AssetRow } from '@/features/office/checkouts/PortableAssetsTable'
import {
  CHECKOUT_LABELS,
  CLOSED_STATUSES,
  abilityOf,
  elapsedLabel,
  formatDateTime,
  overdueMs,
} from '@/features/office/checkouts/checkoutConfig'
import {
  useCheckoutHistory,
  type Checkout,
  type CheckoutInput,
} from '@/features/office/checkouts/checkoutsApi'

/** 반출 건에 대고 하는 처리. 한 마디를 더 받아야 하는 둘(반려·반납)은 부모가 모달을 연다. */
export type CheckoutAction = 'APPROVE' | 'REJECT' | 'START' | 'RETURN' | 'CANCEL'

/** 이력 목록에 적는 건수 — 지금 걸린 건이 먼저 오고 남는 자리를 지난 기록이 채운다. */
const LINE_LIMIT = 5

interface AssetCheckoutModalProps {
  open: boolean
  row: AssetRow | null
  branchName: string | null
  viewer: { id?: string; isManager: boolean }
  busy: boolean
  /** 열자마자 반출 폼으로 갈지(표의 '반출하기'로 들어온 경우). */
  startInForm: boolean
  onAction: (checkout: Checkout, action: CheckoutAction) => void
  onSubmit: (v: CheckoutInput) => void
  onClose: () => void
}

/** 한 건의 반출 — 기간·상태·반출자와, 아직 살아 있는 건이라면 그 건에 할 수 있는 처리. */
function CheckoutLine({
  c,
  viewer,
  busy,
  onAction,
}: {
  c: Checkout
  viewer: { id?: string; isManager: boolean }
  busy: boolean
  onAction: (checkout: Checkout, action: CheckoutAction) => void
}) {
  const can = abilityOf(c, viewer)
  const late = overdueMs(c, new Date().toISOString())
  const closed = CLOSED_STATUSES.includes(c.status)
  const actions = can.canApprove || can.canStart || can.canReturn || can.canCancel

  return (
    <li
      className={cn(
        'rounded-radius-md border px-2.5 py-2',
        // 끝난 건은 테두리만 남긴다 — 지금 손댈 수 있는 건과 한눈에 갈려야 한다.
        closed ? 'border-gray-200' : 'border-gray-200 bg-gray-50',
      )}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-2">
        <span className={cardText.value}>
          {formatDateTime(c.checkoutAt)} ~ {formatDateTime(c.returnedAt ?? c.dueAt)}
        </span>
        <span className={cardText.label}>
          {CHECKOUT_LABELS[c.status]} · {c.createdByName ?? '반출자'}
        </span>
      </div>
      {late > 0 && (
        <p className={cn('mt-0.5 font-semibold text-danger', cardText.label)}>
          {elapsedLabel(late)}
        </p>
      )}
      <p className={cn('mt-0.5 truncate', cardText.label)}>
        {[c.purpose, c.destination, c.returnNote].filter(Boolean).join(' · ')}
      </p>

      {actions && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {can.canApprove && (
            <>
              <Button variant="outline" onClick={() => onAction(c, 'APPROVE')} disabled={busy}>
                승인
              </Button>
              <Button
                variant="outline"
                className="text-danger hover:bg-danger-subtle hover:text-danger"
                onClick={() => onAction(c, 'REJECT')}
                disabled={busy}
              >
                반려
              </Button>
            </>
          )}
          {can.canStart && (
            <Button variant="outline" onClick={() => onAction(c, 'START')} disabled={busy}>
              반출 시작
            </Button>
          )}
          {can.canReturn && (
            <Button variant="outline" onClick={() => onAction(c, 'RETURN')} disabled={busy}>
              반납하기
            </Button>
          )}
          {can.canCancel && (
            <Button variant="ghost" onClick={() => onAction(c, 'CANCEL')} disabled={busy}>
              취소
            </Button>
          )}
        </div>
      )}
    </li>
  )
}

/**
 * 물품 모달 — 왼쪽은 사진(고정 틀·좌우 무한 넘김), 오른쪽은 이 물건에 대해 알아야 할 것과
 * 지금 할 수 있는 일.
 *
 * 좌우로 가르는 이유는 두 열이 서로 다른 질문에 답하기 때문이다. 왼쪽은 "이게 그 물건이
 * 맞나"이고 오른쪽은 "지금 가져갈 수 있나"이며, 위아래로 쌓으면 사진을 보는 동안 답이
 * 화면 밖으로 밀린다.
 *
 * 반출하기를 누르면 폼이 오른쪽 열을 대신한다 — 사진은 그대로 두어, 무엇을 빌리는 중인지가
 * 시각을 고르는 동안에도 눈앞에 남는다.
 */
export function AssetCheckoutModal({
  open,
  row,
  branchName,
  viewer,
  busy,
  startInForm,
  onAction,
  onSubmit,
  onClose,
}: AssetCheckoutModalProps) {
  const [mode, setMode] = useState<'list' | 'form'>('list')
  const asset = row?.asset
  const { data: urls } = useAssetPhotoUrls(asset?.photoPaths ?? [])
  const { data: history } = useCheckoutHistory(open ? asset?.id : undefined, LINE_LIMIT)

  // 열릴 때마다 어디로 들어왔는지에 맞춘다('반출하기'로 눌렀으면 폼부터).
  useEffect(() => {
    if (open) setMode(startInForm ? 'form' : 'list')
  }, [open, startInForm, asset?.id])

  // 지금 걸린 건이 먼저다 — 처리할 수 있는 것을 스크롤해서 찾게 하지 않는다.
  const lines = useMemo(
    () => [...(row?.checkouts ?? []), ...(history ?? [])].slice(0, LINE_LIMIT),
    [row?.checkouts, history],
  )

  if (!asset || !row) return null

  return (
    <Modal open={open} onClose={onClose} title={asset.name} size="xl">
      <DensityProvider value="card">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
          <AssetPhotoCarousel paths={asset.photoPaths} urlOf={(p) => urls?.[p]} />

          {mode === 'form' ? (
            <CheckoutFormView
              asset={asset}
              occupancy={row.checkouts}
              busy={busy}
              onCancel={() => setMode('list')}
              onSubmit={onSubmit}
            />
          ) : (
            <div className="min-w-0 space-y-3">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <InfoField label="품목" value={asset.itemType} />
                <InfoField label="시리얼 번호" value={asset.serialNo} />
                <InfoField label="보유 지사" value={branchName} />
                <InfoField label="반출 승인" value={asset.requiresApproval ? '필요' : '불필요'} />
              </div>
              <InfoField label="설명" value={asset.note} valueClassName="whitespace-pre-line" />

              <div>
                <p className={cn('mb-1.5', cardText.subhead)}>반출 이력</p>
                {lines.length === 0 ? (
                  <p
                    className={cn(
                      'rounded-radius-md border border-dashed border-gray-300 py-5 text-center',
                      cardText.label,
                    )}
                  >
                    지금은 아무도 가져가지 않았습니다.
                  </p>
                ) : (
                  <ul className="space-y-1.5">
                    {lines.map((c) => (
                      <CheckoutLine
                        key={c.id}
                        c={c}
                        viewer={viewer}
                        busy={busy}
                        onAction={onAction}
                      />
                    ))}
                  </ul>
                )}
              </div>

              <Button className="w-full" onClick={() => setMode('form')} disabled={busy}>
                + 반출하기
              </Button>
            </div>
          )}
        </div>
      </DensityProvider>
    </Modal>
  )
}
