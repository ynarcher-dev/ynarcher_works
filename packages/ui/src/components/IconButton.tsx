import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '../utils/cn'
import { useDensity, type Density } from '../density'
import { iconScale } from '../densityScale'

export type IconButtonVariant = 'outline' | 'ghost' | 'selected'

const variantClass: Record<IconButtonVariant, string> = {
  outline:
    'border border-gray-300 bg-white text-gray-500 hover:bg-gray-25 hover:text-gray-700',
  ghost: 'border border-transparent text-gray-500 hover:bg-gray-100 hover:text-gray-800',
  selected: 'border border-gray-400 bg-gray-100 text-gray-900',
}

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** 아이콘 노드(lucide 등). 앱에서 주입해 UI 패키지의 의존성을 유지하지 않는다. */
  icon: ReactNode
  /** 스크린리더 라벨. `title`도 함께 지정하면 툴팁으로 노출된다. */
  label: string
  variant?: IconButtonVariant
  /** 밀도 맥락 강제 지정. 생략하면 부모 Card·DataTable이 내려준 맥락을 자동으로 따른다. */
  density?: Density
  /** 위험 동작(끄기·삭제)용 호버 톤. */
  danger?: boolean
}

/**
 * 정사각 아이콘 버튼(카드 우상단 액션·뷰 토글 등).
 * 근거: 5_component_spec_rules.md §2.1 (Button & IconButton)
 */
export function IconButton({
  icon,
  label,
  variant = 'outline',
  density,
  danger = false,
  className,
  type = 'button',
  ...props
}: IconButtonProps) {
  const s = iconScale[useDensity(density)]
  return (
    <button
      type={type}
      aria-label={label}
      className={cn(
        'grid shrink-0 place-items-center rounded-radius-md transition-colors duration-fast',
        'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/10',
        'disabled:cursor-not-allowed disabled:opacity-55',
        variantClass[variant],
        s.box,
        danger && 'hover:bg-danger-subtle hover:text-danger',
        className,
      )}
      {...props}
    >
      {icon}
    </button>
  )
}
