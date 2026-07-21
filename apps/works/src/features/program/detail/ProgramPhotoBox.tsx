import { Image as ImageIcon } from 'lucide-react'
import { cn } from '@ynarcher/ui'

interface Props {
  /** 커버 이미지 URL 또는 data URL. 없으면 플레이스홀더. */
  src?: string | null
  className?: string
}

/**
 * 프로그램 커버 이미지 박스(정사각, 라운드).
 * NETWORKS·STARTUP 상세 헤더의 PhotoBox와 CSS를 동일하게 맞추되(size-20·rounded-radius-lg·bg-gray-100),
 * 인물이 아닌 프로그램 커버이므로 플레이스홀더 아이콘만 이미지 아이콘으로 대체한다.
 */
export function ProgramPhotoBox({ src, className }: Props) {
  return src ? (
    <img
      src={src}
      alt=""
      className={cn('size-20 shrink-0 rounded-radius-lg object-cover', className)}
    />
  ) : (
    <div
      className={cn(
        'flex size-20 shrink-0 items-center justify-center rounded-radius-lg bg-gray-100 text-gray-500',
        className,
      )}
    >
      <ImageIcon className="size-8" aria-hidden />
    </div>
  )
}
