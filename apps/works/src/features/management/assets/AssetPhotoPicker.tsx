import { ImagePicker } from '@/components/ImagePicker'
import { ASSET_PHOTO_MAX, ASSET_PHOTO_MAX_BYTES } from '@/features/management/config'
import { uploadAssetPhoto, useAssetPhotoUrls } from '@/features/management/assets/assetPhotos'

interface AssetPhotoPickerProps {
  /** 현재 사진 경로 목록(assets.photo_paths). 순서가 곧 표시 순서다. */
  value: string[]
  onChange: (next: string[]) => void
  disabled?: boolean
}

/**
 * 자산 사진 편집기 — 최대 5장, 고른 즉시 비공개 버킷에 올리고 경로만 상위로 넘긴다.
 *
 * 규격(점선 상자·미리보기 격자·삭제 버튼·상한 문구)은 2026-09-08에 공용 `ImagePicker`로 올렸다.
 * 여기 남는 것은 **이 도메인만 아는 것 셋**이다 — 어느 버킷에 올리는가, 어느 게이트로 서명한
 * URL을 받는가, 상한이 얼마인가.
 */
export function AssetPhotoPicker({ value, onChange, disabled }: AssetPhotoPickerProps) {
  const { data: urls } = useAssetPhotoUrls(value)
  return (
    <ImagePicker
      value={value}
      onChange={onChange}
      upload={uploadAssetPhoto}
      urls={urls}
      max={ASSET_PHOTO_MAX}
      maxBytes={ASSET_PHOTO_MAX_BYTES}
      noun="사진"
      disabled={disabled}
    />
  )
}
