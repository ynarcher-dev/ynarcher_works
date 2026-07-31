import { Button, DensityProvider, InfoField, InfoGrid, Modal } from '@ynarcher/ui'
import { useEffect, useMemo, useState } from 'react'
// 사진 서명은 자산 원장이 소유한 헬퍼를 그대로 쓴다 — 같은 버킷을 두 곳에서 다르게 다루면
// 만료 시간과 실패 처리가 갈린다(조회 권한은 내부 임직원으로 열려 있다).
import { useAssetPhotoUrls } from '@/features/management/assets/assetPhotos'
import { AssetPhotoCarousel } from '@/features/office/checkouts/AssetPhotoCarousel'
import { CheckoutFormView } from '@/features/office/checkouts/CheckoutFormView'
import { CheckoutHistoryList } from '@/features/office/checkouts/CheckoutHistoryList'
import type { AssetRow } from '@/features/office/checkouts/PortableAssetsTable'
import type {
  CheckoutAction,
  CheckoutViewer,
} from '@/features/office/checkouts/checkoutConfig'
import {
  useCheckoutHistory,
  type Checkout,
  type CheckoutInput,
} from '@/features/office/checkouts/checkoutsApi'

/** 이력 목록에 적는 건수 — 지금 걸린 건이 먼저 오고 남는 자리를 지난 기록이 채운다. */
const LINE_LIMIT = 5

interface AssetCheckoutModalProps {
  open: boolean
  row: AssetRow | null
  branchName: string | null
  /** 비품 관리자 이름(자산 원장의 할당 대상). 없으면 빈 칸. */
  managerName: string | null
  viewer: CheckoutViewer
  busy: boolean
  onAction: (checkout: Checkout, action: CheckoutAction) => void
  onSubmit: (v: CheckoutInput) => void
  onClose: () => void
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
  managerName,
  viewer,
  busy,
  onAction,
  onSubmit,
  onClose,
}: AssetCheckoutModalProps) {
  const [mode, setMode] = useState<'list' | 'form'>('list')
  const asset = row?.asset
  const { data: urls } = useAssetPhotoUrls(asset?.photoPaths ?? [])
  const { data: history } = useCheckoutHistory(open ? asset?.id : undefined, LINE_LIMIT)

  // 열 때마다 물건을 읽는 자리에서 시작한다 — 폼은 여기서 '반출하기'를 눌러야 나온다.
  useEffect(() => {
    if (open) setMode('list')
  }, [open, asset?.id])

  // 지금 걸린 건이 먼저다 — 처리할 수 있는 것을 스크롤해서 찾게 하지 않는다. 걸린 건끼리는
  // 최근 반출순으로 세워, 그 뒤를 잇는 지난 기록(같은 정렬)과 시간의 방향이 어긋나지 않게 한다.
  const lines = useMemo(() => {
    const live = [...(row?.checkouts ?? [])].sort((a, b) =>
      b.checkoutAt.localeCompare(a.checkoutAt),
    )
    return [...live, ...(history ?? [])].slice(0, LINE_LIMIT)
  }, [row?.checkouts, history])

  // 연체 판정의 기준 시각은 한 번 읽어 목록 전체가 나눠 쓴다 — 행마다 new Date()를 부르면
  // 같은 목록 안에서 기준이 미세하게 갈린다(표도 같은 방식으로 `now`를 내려받는다).
  const now = new Date().toISOString()

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
              {/*
                읽는 순서는 "무엇인가 → 어디 있나 → 지금 되나 → 누구에게 묻나"다. 모달 제목이
                이미 품목명을 달고 있어도 격자의 첫 칸에 다시 적는다 — 제목은 창의 이름이고,
                이 격자는 물건의 명세라 그 첫 줄이 비면 나머지 값이 무엇에 대한 것인지
                격자 안에서 답하지 못한다.
              */}
              <InfoGrid columns={2}>
                <InfoField label="품목명" value={asset.name} valueClassName="truncate" />
                <InfoField label="품목" value={asset.itemType} />
                <InfoField label="시리얼 번호" value={asset.serialNo} />
                <InfoField label="보유 지사" value={branchName} />
                <InfoField
                  label="재고"
                  value={`잔여 ${row.remaining}개 / 보유 ${asset.quantity}개`}
                />
                <InfoField label="반출 승인" value={asset.requiresApproval ? '필요' : '불필요'} />
                <InfoField label="관리자" value={managerName} />
              </InfoGrid>
              <InfoField label="설명" value={asset.note} valueClassName="whitespace-pre-line" />

              <CheckoutHistoryList
                lines={lines}
                limit={LINE_LIMIT}
                now={now}
                viewer={viewer}
                busy={busy}
                onAction={onAction}
              />

              <Button className="w-full" onClick={() => setMode('form')} disabled={busy}>
                + 예약하기
              </Button>
            </div>
          )}
        </div>
      </DensityProvider>
    </Modal>
  )
}
