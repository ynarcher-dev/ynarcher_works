import { cn } from '../utils/cn'
import { useDensity, type Density } from '../density'
import { avatarScale } from '../densityScale'

export interface AvatarProps {
  name: string
  src?: string | null
  /** 밀도 맥락 강제 지정. 생략하면 부모 Card·DataTable의 맥락을 따른다. */
  density?: Density
  className?: string
}

/** 아바타(이미지 또는 이니셜 폴백). */
export function Avatar({ name, src, density, className }: AvatarProps) {
  const s = avatarScale[useDensity(density)]
  const initial = name.trim().charAt(0).toUpperCase()
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-gray-100 font-medium text-gray-600',
        s.box,
        s.text,
        className,
      )}
    >
      {src ? <img src={src} alt={name} className="size-full object-cover" /> : initial}
    </span>
  )
}
