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
        // 호버 배경은 Outline 버튼과 같은 gray-50이다(4_color_system_rules.md §5.1).
        // gray-25는 리스트 행 호버 전용이라, 목록 끝에 붙는 이 버튼에 쓰면 바로 위 행을 짚은
        // 것과 같은 색이 되어 지금 무엇을 가리키고 있는지 구분되지 않는다.
        'hover:border-gray-400 hover:bg-gray-50 hover:text-gray-900',
        'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/10',
        'disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:border-gray-300 disabled:hover:bg-transparent',
        className,
      )}
    >
      {icon}
      <span className="text-body font-medium">{children}</span>
    </button>
  )
}
