import { cn } from '../utils/cn'

export interface AvatarProps {
  name: string
  src?: string | null
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const sizeClass = {
  sm: 'size-6 text-caption',
  md: 'size-8 text-body',
  lg: 'size-10 text-body-lg',
}

/** 아바타(이미지 또는 이니셜 폴백). */
export function Avatar({ name, src, size = 'md', className }: AvatarProps) {
  const initial = name.trim().charAt(0).toUpperCase()
  return (
    <span
      className={cn(
        'inline-flex items-center justify-center overflow-hidden rounded-full bg-gray-100 font-medium text-gray-600',
        sizeClass[size],
        className,
      )}
    >
      {src ? (
        <img src={src} alt={name} className="size-full object-cover" />
      ) : (
        initial
      )}
    </span>
  )
}
