import { User } from 'lucide-react'
import { cn } from '@ynarcher/ui'

interface Props {
  /** 사진 URL 또는 data URL. 없으면 플레이스홀더. */
  src?: string | null
  className?: string
}

/** 인물 사진 박스(정사각, 라운드). 미첨부 시 인물 아이콘 플레이스홀더. */
export function PhotoBox({ src, className }: Props) {
  return src ? (
    <img
      src={src}
      alt=""
      className={cn('size-20 shrink-0 rounded-radius-lg object-cover', className)}
    />
  ) : (
    <div
      className={cn(
        'flex size-20 shrink-0 items-center justify-center rounded-radius-lg bg-gray-100 text-gray-400',
        className,
      )}
    >
      <User className="size-8" aria-hidden />
    </div>
  )
}
