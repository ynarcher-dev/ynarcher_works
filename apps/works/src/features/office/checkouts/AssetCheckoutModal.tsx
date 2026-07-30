import { Button, DensityProvider, InfoField, InfoGrid, Modal, cardText, cn } from '@ynarcher/ui'
import { useEffect, useState } from 'react'
// 사진 서명은 자산 원장이 소유한 헬퍼를 그대로 쓴다 — 같은 버킷을 두 곳에서 다르게 다루면
// 만료 시간과 실패 처리가 갈린다(조회 권한은 내부 임직원으로 열려 있다).
import { useAssetPhotoUrls } from '@/features/management/assets/assetPhotos'
import { CheckoutFormView } from '@/features/office/checkouts/CheckoutFormView'
import type { AssetRow } from '@/features/office/checkouts/PortableAssetsTable'
import {
  CHECKOUT_LABELS,
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

/** 한 건의 반출 — 기간·목적과 그 건에 할 수 있는 처리. */
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

  return (
    <li className="rounded-radius-md border border-gray-200 bg-gray-50 p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className={cardText.subhead}>
          {formatDateTime(c.checkoutAt)} ~ {formatDateTime(c.dueAt)}
          {late > 0 && <b className="ml-1 font-semibold text-danger">{elapsedLabel(late)}</b>}
        </p>
        <span className={cn(cardText.label)}>
          {CHECKOUT_LABELS[c.status]} · {c.createdByName ?? '반출자'}
        </span>
      </div>
      <p className={cn('mt-0.5', cardText.label)}>
        {[c.purpose, c.destination].filter(Boolean).join(' · ')}
      </p>
      {c.note && <p className={cn('mt-0.5', cardText.label)}>{c.note}</p>}

      <div className="mt-2 flex flex-wrap gap-1">
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
    </li>
  )
}

/**
 * 물품 모달 — 이 물건이 무엇인지(사진·설명)와 지금 누가 갖고 있는지를 한자리에서 보고,
 * 그 자리에서 반출하거나 반납한다. 회의실 예약 모달(그날 예약 목록 + '+ 예약하기')과 같은
 * 목록 → 폼 흐름이며, 다른 것은 예약 대상이 공간이 아니라 물건이라는 점뿐이다.
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
  const { data: history } = useCheckoutHistory(open ? asset?.id : undefined, 5)

  // 열릴 때마다 어디로 들어왔는지에 맞춘다('반출하기'로 눌렀으면 폼부터).
  useEffect(() => {
    if (open) setMode(startInForm ? 'form' : 'list')
  }, [open, startInForm, asset?.id])

  if (!asset || !row) return null

  return (
    <Modal open={open} onClose={onClose} title={asset.name} size="lg">
      <DensityProvider value="card">
        {mode === 'form' ? (
          <CheckoutFormView
            asset={asset}
            occupancy={row.checkouts}
            busy={busy}
            onCancel={() => setMode('list')}
            onSubmit={onSubmit}
          />
        ) : (
          <div className="space-y-4">
            {/* 사진이 이 물건을 알아보는 첫 단서다 — 글로 적은 사양보다 먼저 온다. */}
            {asset.photoPaths.length > 0 && (
              <div className="flex gap-2 overflow-x-auto">
                {asset.photoPaths.map((p) => {
                  const url = urls?.[p]
                  return (
                    <span
                      key={p}
                      className="size-28 shrink-0 overflow-hidden rounded-radius-md border border-gray-200 bg-gray-50"
                    >
                      {url && <img src={url} alt="" className="size-full object-cover" />}
                    </span>
                  )
                })}
              </div>
            )}

            <InfoGrid columns={2}>
              <InfoField label="품목" value={asset.itemType} />
              <InfoField label="시리얼 번호" value={asset.serialNo} />
              <InfoField label="지사" value={branchName} />
              <InfoField label="반출 승인" value={asset.requiresApproval ? '필요' : '불필요'} />
            </InfoGrid>
            {asset.note && <InfoField label="설명" value={asset.note} />}

            <div>
              <p className={cn('mb-2', cardText.subhead)}>지금 걸려 있는 반출</p>
              {row.checkouts.length === 0 ? (
                <p
                  className={cn(
                    'rounded-radius-md border border-dashed border-gray-300 py-6 text-center',
                    cardText.label,
                  )}
                >
                  지금은 아무도 가져가지 않았습니다.
                </p>
              ) : (
                <ul className="space-y-2">
                  {row.checkouts.map((c) => (
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

            {/* 지난 기록은 접어 두지 않고 짧게 적는다 — 이 물건이 얼마나 자주 나가는지가 곧
                다음 사람의 판단 재료가 된다. */}
            {history && history.length > 0 && (
              <div>
                <p className={cn('mb-1', cardText.subhead)}>지난 기록</p>
                <ul className="space-y-1">
                  {history.map((c) => (
                    <li key={c.id} className={cardText.label}>
                      {formatDateTime(c.checkoutAt)} ~{' '}
                      {formatDateTime(c.returnedAt ?? c.dueAt)} · {c.createdByName ?? '반출자'} ·{' '}
                      {CHECKOUT_LABELS[c.status]}
                      {c.returnNote && ` · ${c.returnNote}`}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <Button className="w-full" onClick={() => setMode('form')} disabled={busy}>
              + 반출하기
            </Button>
          </div>
        )}
      </DensityProvider>
    </Modal>
  )
}
