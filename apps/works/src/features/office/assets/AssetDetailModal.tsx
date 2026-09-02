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
 * 물품 상세 모달 — 위는 사진(고정 틀·좌우 무한 넘김), 아래는 이 물건에 대해 알아야 할 것.
 *
 * 2026-09-02에 좌우 2열에서 위아래로 바꿨다. 두 열은 폭을 나눠 갖는 대신 양쪽 다 좁아져,
 * 사진은 물건을 알아볼 만큼 크지 못하고 정보는 라벨:값 두 칸으로 접혀 있었다. 읽는 순서가
 * 애초에 "이게 그 물건이 맞나 → 어디로 가면 되나"라는 한 방향이므로, 세로로 쌓으면 두 질문이
 * 차례로 놓이고 각자 폭을 다 쓴다.
 *
 * 창은 `md`(600px)다. 위아래로 쌓은 뒤 폭이 곧 사진의 크기가 되므로, `lg`(800px)에서는 사진
 * 한 장이 첫 화면을 거의 다 먹고 명세가 그 아래로 밀렸다. 값이 일곱 개뿐인 조회용 창이라
 * 단일 폼 폭이면 충분하며, 높이는 16:9 틀이 폭을 따라 함께 줄어 비율이 그대로 유지된다.
 *
 * **조작이 없다.** 등록·수정·폐기는 MANAGEMENT `자산 관리`가 소유하고, 실제로 빌려 가는 일은
 * 창고의 오프라인 현황판이 맡는다(2026-08-25 결정). 이 창은 "회사에 이런 물건이 있고 저기
 * 있다"까지만 답한다.
 *
 * 시리얼 번호는 적지 않는다 — 물건을 찾아가는 데 쓰이는 값이 아니라 원장을 대사할 때 쓰는
 * 값이고, 그 일은 MANAGEMENT 자산 관리가 한다(뷰에서도 내려오지 않는다).
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
    <Modal open={open} onClose={onClose} title={asset.name} size="md">
      <DensityProvider value="card">
        <div className="space-y-4">
          <AssetPhotoCarousel
            paths={asset.photoPaths}
            urlOf={(p) => urls?.[p]}
            variant="wide"
          />

          {/*
            읽는 순서는 "무엇인가 → 몇 개인가 → 어디 있나 → 누구에게 묻나"다. 모달 제목이
            이미 품목명을 달고 있어도 격자의 첫 칸에 다시 적는다 — 제목은 창의 이름이고,
            이 격자는 물건의 명세라 그 첫 줄이 비면 나머지 값이 무엇에 대한 것인지
            격자 안에서 답하지 못한다.

            지사와 위치는 **같은 줄의 이웃한 두 칸**이다(2열 격자라 마지막 줄에 함께 세운다).
            둘이 합쳐 "어디 있나" 하나에 답하며, 지사까지 갔을 때 그 안에서 어디로 가면
            되는지를 위치가 잇는다 — 줄이 갈리면 한 답의 앞뒤가 서로 다른 줄에 놓인다.
          */}
          <InfoGrid columns={2}>
            <InfoField label="품목명" value={asset.name} valueClassName="truncate" />
            <InfoField label="품목" value={asset.itemType} />
            <InfoField label="보유 수량" value={`${asset.quantity}개`} />
            <InfoField label="관리자" value={managerName} valueClassName="truncate" />
            <InfoField label="보유 지사" value={branchName} />
            <InfoField label="위치" value={asset.location} valueClassName="truncate" />
          </InfoGrid>

          {/* 설명은 줄이 길어 격자 안에 넣지 않는다 — 한 칸이 옆 칸 높이까지 밀어 올린다. */}
          <InfoField
            label="설명"
            value={asset.note}
            valueClassName="whitespace-pre-line"
            className="border-t border-gray-200 pt-3"
          />
        </div>
      </DensityProvider>
    </Modal>
  )
}
