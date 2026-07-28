import { Button, cn, useToast } from '@ynarcher/ui'
import { ImageIcon } from 'lucide-react'
import { type ChangeEvent, useState } from 'react'
import { roomPhotoUrl, uploadRoomPhoto } from '@/features/office/rooms/meetingRoomsApi'

/** 회의실 사진 최대 크기(원본 파일 기준). */
const PHOTO_MAX_BYTES = 5_000_000

interface Props {
  /** 현재 사진 저장 경로(photo_path). 없으면 미첨부. */
  value: string | null
  onChange: (path: string | null) => void
}

/**
 * 회의실 사진 편집기(가로형 미리보기 + 업로드/삭제). ADMIN 회의실 폼 전용.
 * 선택 즉시 공개 버킷(meeting-room-photos)에 업로드하고 저장 경로만 상위로 넘긴다.
 * (업로드 RLS는 admin 전용. 삭제는 경로만 비우고 오브젝트는 보존한다.)
 */
export function RoomPhotoPicker({ value, onChange }: Props) {
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const url = roomPhotoUrl(value)

  const onPick = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (file.size > PHOTO_MAX_BYTES) {
      toast.show('이미지는 5MB 이하만 첨부할 수 있습니다.', 'warning')
      return
    }
    setBusy(true)
    try {
      const path = await uploadRoomPhoto(file)
      onChange(path)
    } catch {
      toast.show('사진 업로드에 실패했습니다. 권한을 확인하세요.', 'danger')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex items-start gap-4">
      <div
        className={cn(
          'flex h-24 w-40 shrink-0 items-center justify-center overflow-hidden rounded-radius-lg bg-gray-100 text-gray-400',
        )}
      >
        {url ? (
          <img src={url} alt="" className="h-full w-full object-cover" />
        ) : (
          <ImageIcon className="size-7" aria-hidden />
        )}
      </div>
      <div className="flex flex-col gap-2">
        <label className="cursor-pointer rounded-radius-md border border-gray-300 px-3 py-1.5 text-center text-body text-gray-700 transition-colors hover:bg-gray-50">
          {busy ? '업로드 중…' : '사진 첨부'}
          <input
            type="file"
            accept="image/*"
            className="hidden"
            disabled={busy}
            onChange={onPick}
          />
        </label>
        {value && (
          <Button type="button" variant="secondary" onClick={() => onChange(null)} disabled={busy}>
            삭제
          </Button>
        )}
      </div>
    </div>
  )
}
