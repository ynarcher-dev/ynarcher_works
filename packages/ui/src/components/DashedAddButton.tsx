import type { ReactNode } from 'react'
import { cn } from '../utils/cn'

export interface DashedAddButtonProps {
  onClick?: () => void
  /** 좌측 아이콘(선택). 앱에서 주입한다. */
  icon?: ReactNode
  children: ReactNode
  disabled?: boolean
  className?: string
}

/**
 * 보드·리스트 하단의 점선 '추가' 카드 버튼.
 * 목록의 마지막 항목처럼 보이되 실선 카드와 구분되도록 점선 테두리를 유지한다.
 */
export function DashedAddButton({
  onClick,
  icon,
  children,
  disabled,
  className,
}: DashedAddButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex w-full items-center justify-center gap-1.5 rounded-radius-md border border-dashed border-gray-300 px-4 py-3 text-gray-700 transition-colors duration-fast',
        'hover:border-gray-400 hover:bg-gray-25 hover:text-gray-900',
        'disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:border-gray-300 disabled:hover:bg-transparent',
        className,
      )}
    >
      {icon}
      <span className="text-body font-medium">{children}</span>
    </button>
  )
}
