import { cn, Tooltip, tooltipScale, useToast } from '@ynarcher/ui'
import { ImagePlus, X } from 'lucide-react'
import { type ChangeEvent, useState } from 'react'
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
 * 저장을 눌러야 올라가는 방식으로 만들지 않았다. 폼 저장은 원장 한 행을 쓰는 일인데 거기에
 * 파일 다섯 개의 업로드를 묶으면, 넷째 장에서 실패했을 때 무엇이 저장되고 무엇이 안 됐는지를
 * 사용자가 알 수 없다. 사진은 고른 자리에서 끝내고, 폼은 경로 배열만 저장한다.
 *
 * 그 대신 등록을 취소하면 방금 올린 오브젝트는 아무도 참조하지 않는 채로 남는다. 비공개 버킷이라
 * 새어 나가지는 않으므로, 물리 삭제를 하지 않는다는 원칙을 지키는 쪽을 택했다(회의실 사진과 동일).
 */
export function AssetPhotoPicker({ value, onChange, disabled }: AssetPhotoPickerProps) {
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const { data: urls } = useAssetPhotoUrls(value)
  const remaining = ASSET_PHOTO_MAX - value.length

  const onPick = async (e: ChangeEvent<HTMLInputElement>) => {
    const picked = [...(e.target.files ?? [])]
    // 같은 파일을 연달아 고를 수 있어야 하므로 입력값을 먼저 비운다.
    e.target.value = ''
    if (!picked.length) return

    // 넘치게 고르면 앞에서부터 받고 몇 장이 남았는지 알린다 — 말없이 자르면 왜 안 붙었는지 모른다.
    const files = picked.slice(0, remaining)
    if (picked.length > remaining) {
      toast.show(`사진은 최대 ${ASSET_PHOTO_MAX}장입니다. ${files.length}장만 첨부합니다.`, 'warning')
    }
    const tooBig = files.filter((f) => f.size > ASSET_PHOTO_MAX_BYTES)
    if (tooBig.length) {
      toast.show('사진 한 장은 5MB 이하여야 합니다.', 'warning')
    }
    const target = files.filter((f) => f.size <= ASSET_PHOTO_MAX_BYTES)
    if (!target.length) return

    setBusy(true)
    try {
      // 한 장이 실패해도 올라간 것은 살린다 — 전부 되돌리면 성공한 업로드까지 다시 고르게 된다.
      const results = await Promise.allSettled(target.map(uploadAssetPhoto))
      const added = results
        .filter((r): r is PromiseFulfilledResult<string> => r.status === 'fulfilled')
        .map((r) => r.value)
      if (added.length) onChange([...value, ...added])
      if (added.length < target.length) {
        toast.show('일부 사진 업로드에 실패했습니다. 권한을 확인하세요.', 'danger')
      }
    } finally {
      setBusy(false)
    }
  }

  const removeAt = (index: number) => {
    onChange(value.filter((_, i) => i !== index))
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {value.map((path, i) => (
          <div
            key={path}
            className="group relative size-24 overflow-hidden rounded-radius-md border border-gray-200 bg-gray-100"
          >
            {urls?.[path] ? (
              <img src={urls[path]} alt="" className="size-full object-cover" />
            ) : (
              <span className="flex size-full items-center justify-center text-caption text-gray-400">
                불러오는 중…
              </span>
            )}
            {!disabled && (
              <button
                type="button"
                onClick={() => removeAt(i)}
                aria-label={`${i + 1}번째 사진 삭제`}
                className="absolute right-1 top-1 rounded-full bg-gray-900/60 p-1 text-white transition-opacity hover:bg-gray-900/80"
              >
                <X className="size-3" aria-hidden />
              </button>
            )}
          </div>
        ))}

        {remaining > 0 && !disabled && (
          <label
            className={cn(
              'flex size-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-radius-md',
              'border border-dashed border-gray-300 text-gray-500 transition-colors hover:bg-gray-50',
              busy && 'pointer-events-none opacity-60',
            )}
          >
            <ImagePlus className="size-5" aria-hidden />
            <span className="text-caption">{busy ? '올리는 중…' : '사진 첨부'}</span>
            <input
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              disabled={busy}
              onChange={onPick}
            />
          </label>
        )}
      </div>
      <p className="text-caption text-gray-500">
        {value.length}/{ASSET_PHOTO_MAX}장
        <Tooltip
          label="사진"
          content={'한 장당 5MB 이하입니다.\n목록은 저장을 눌러야 자산에 반영됩니다.'}
          className={tooltipScale.gap}
        />
      </p>
    </div>
  )
}
