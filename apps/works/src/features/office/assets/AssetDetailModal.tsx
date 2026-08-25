import { DensityProvider, InfoField, InfoGrid, Modal } from '@ynarcher/ui'
// 사진 서명은 자산 원장이 소유한 헬퍼를 그대로 쓴다 — 같은 버킷을 두 곳에서 다르게 다루면
// 만료 시간과 실패 처리가 갈린다(조회 권한은 내부 임직원으로 열려 있다).
import { useAssetPhotoUrls } from '@/features/management/assets/assetPhotos'
import { AssetPhotoCarousel } from '@/features/office/assets/AssetPhotoCarousel'
import type { PortableAsset } from '@/features/office/assets/portableAssetsApi'

interface AssetDetailModalProps {
  open: boolean
  asset: PortableAsset | null
  branchName: string | null
  /** 이 물건을 맡은 사람(자산 원장의 할당 대상). 없으면 빈 칸. */
  managerName: string | null
  onClose: () => void
}

/**
 * 물품 상세 모달 — 왼쪽은 사진(고정 틀·좌우 무한 넘김), 오른쪽은 이 물건에 대해 알아야 할 것.
 *
 * 좌우로 가르는 이유는 두 열이 서로 다른 질문에 답하기 때문이다. 왼쪽은 "이게 그 물건이
 * 맞나"이고 오른쪽은 "무엇이고 누구에게 물어보나"이며, 위아래로 쌓으면 사진을 보는 동안
 * 답이 화면 밖으로 밀린다.
 *
 * **조작이 없다.** 등록·수정·폐기는 MANAGEMENT `자산 관리`가 소유하고, 실제로 빌려 가는 일은
 * 창고의 오프라인 현황판이 맡는다(2026-08-25 결정). 이 창은 "회사에 이런 물건이 있고 저기
 * 있다"까지만 답한다.
 */
export function AssetDetailModal({
  open,
  asset,
  branchName,
  managerName,
  onClose,
}: AssetDetailModalProps) {
  const { data: urls } = useAssetPhotoUrls(asset?.photoPaths ?? [])

  if (!asset) return null

  return (
    <Modal open={open} onClose={onClose} title={asset.name} size="xl">
      <DensityProvider value="card">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
          <AssetPhotoCarousel paths={asset.photoPaths} urlOf={(p) => urls?.[p]} />

          <div className="min-w-0 space-y-3">
            {/*
              읽는 순서는 "무엇인가 → 몇 개인가 → 어디 있나 → 누구에게 묻나"다. 모달 제목이
              이미 품목명을 달고 있어도 격자의 첫 칸에 다시 적는다 — 제목은 창의 이름이고,
              이 격자는 물건의 명세라 그 첫 줄이 비면 나머지 값이 무엇에 대한 것인지
              격자 안에서 답하지 못한다.
            */}
            <InfoGrid columns={2}>
              <InfoField label="품목명" value={asset.name} valueClassName="truncate" />
              <InfoField label="품목" value={asset.itemType} />
              <InfoField label="시리얼 번호" value={asset.serialNo} />
              <InfoField label="보유 수량" value={`${asset.quantity}개`} />
              <InfoField label="보유 지사" value={branchName} />
              <InfoField label="관리자" value={managerName} />
            </InfoGrid>
            <InfoField label="설명" value={asset.note} valueClassName="whitespace-pre-line" />
          </div>
        </div>
      </DensityProvider>
    </Modal>
  )
}
