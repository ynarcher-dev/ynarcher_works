import type { ReactNode } from 'react'
import { cn } from '../utils/cn'

export type PhotoBoxSize = 'sm' | 'md' | 'lg'

const sizeClass: Record<PhotoBoxSize, string> = {
  sm: 'size-12',
  md: 'size-16',
  lg: 'size-20',
}

export interface PhotoBoxProps {
  /** 이미지 URL 또는 data URL. 없으면 플레이스홀더를 렌더한다. */
  src?: string | null
  /** 이미지 대체 텍스트(장식용이면 빈 문자열). */
  alt?: string
  /** 플레이스홀더 아이콘 노드. 앱에서 주입한다(UI 패키지는 아이콘 의존성을 갖지 않는다). */
  placeholder?: ReactNode
  size?: PhotoBoxSize
  className?: string
}

/**
 * 상세 헤더 좌측 커버/프로필 이미지 박스(정사각·라운드).
 * 이미지가 없을 때는 회색 배경 + 주입된 플레이스홀더 아이콘으로 동일 규격을 유지한다.
 * 근거: 5_component_spec_rules.md §2.5 (Avatar 규격 준용)
 */
export function PhotoBox({
  src,
  alt = '',
  placeholder,
  size = 'lg',
  className,
}: PhotoBoxProps) {
  if (src) {
    return (
      <img
        src={src}
        alt={alt}
        className={cn(
          'shrink-0 rounded-radius-lg object-cover',
          sizeClass[size],
          className,
        )}
      />
    )
  }
  return (
    <div
      className={cn(
        'flex shrink-0 items-center justify-center rounded-radius-lg bg-gray-100 text-gray-400',
        sizeClass[size],
        className,
      )}
      aria-hidden
    >
      {placeholder}
    </div>
  )
}
