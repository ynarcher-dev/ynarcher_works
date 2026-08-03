import { Button, cn, useToast } from '@ynarcher/ui'
import { type ChangeEvent } from 'react'
import { PhotoBox } from '@/features/networks/PhotoBox'

/** 사진 최대 크기(원본 파일 기준). data URL로 인코딩되어 profile.photo에 저장된다. */
export const PHOTO_MAX_BYTES = 2_000_000

interface Props {
  /** 현재 사진(data URL 또는 URL). 빈 문자열이면 미첨부. */
  value: string
  onChange: (next: string) => void
  /** 세로 배치 — 사진 아래에 버튼을 한 줄에 하나씩 쌓는다(좁은 열에 세울 때). */
  vertical?: boolean
  className?: string
}

/**
 * 인물 사진 편집기(미리보기 + 첨부/삭제). NETWORKS·임직원·마이페이지 공용.
 * Storage가 아니라 2MB 이하 data URL로 `profile.photo`에 담는다(전 화면 동일 규약).
 */
export function PhotoPicker({ value, onChange, vertical, className }: Props) {
  const toast = useToast()

  const onPick = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (file.size > PHOTO_MAX_BYTES) {
      toast.show('이미지는 2MB 이하만 첨부할 수 있습니다.', 'warning')
      return
    }
    const reader = new FileReader()
    reader.onload = () => onChange(String(reader.result))
    reader.readAsDataURL(file)
  }

  return (
    <div
      className={cn(
        'flex gap-4',
        vertical ? 'flex-col items-start gap-2' : 'items-center',
        className,
      )}
    >
      <PhotoBox src={value || null} />
      <div className={cn('flex gap-2', vertical && 'flex-col')}>
        <label className="cursor-pointer rounded-radius-md border border-gray-300 px-3 py-1.5 text-center text-body text-gray-700 transition-colors hover:bg-gray-50">
          사진 첨부
          <input type="file" accept="image/*" className="hidden" onChange={onPick} />
        </label>
        {value && (
          <Button type="button" variant="secondary" onClick={() => onChange('')}>
            삭제
          </Button>
        )}
      </div>
    </div>
  )
}
