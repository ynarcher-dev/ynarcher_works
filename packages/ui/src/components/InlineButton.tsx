import type { ButtonHTMLAttributes } from 'react'
import { cn } from '../utils/cn'

export type InlineButtonTone = 'primary' | 'danger' | 'outline'

const toneClass: Record<InlineButtonTone, string> = {
  primary: 'bg-brand !text-white shadow-sm shadow-brand/20 hover:bg-brand-600 active:bg-brand-700',
  danger: 'bg-danger-700 !text-white shadow-sm shadow-danger/20 hover:bg-danger-800 active:bg-danger-900',
  outline:
    'border border-gray-300 bg-white text-gray-800 shadow-sm hover:border-gray-400 hover:bg-gray-25 active:bg-gray-50',
}

export interface InlineButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  tone?: InlineButtonTone
  /**
   * 위험 동작(비활성화·삭제)용 호버 톤. 평소에는 다른 인라인 액션과 같은 무게로 서 있다가
   * 호버 시에만 위험색을 드러낸다 — 표에 빨간 버튼이 행마다 깔리는 것을 피한다.
   * IconButton의 동명 prop과 같은 규약이다.
   */
  danger?: boolean
}

/**
 * 데이터 테이블 셀 전용 컴팩트 버튼. 표준 행(`row` 32px) 안에 위아래 4px 여유를 남기도록
 * `ctl-table`(24px)을 쓰며, 인접한 InlineSelect와 동일 규격으로 셀 안에서 높이가 어긋나지 않게 한다.
 * 근거: 5_component_spec_rules.md §1.2 / §2.1
 */
export function InlineButton({
  tone = 'primary',
  danger = false,
  className,
  type = 'button',
  ...props
}: InlineButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex h-ctl-table shrink-0 items-center justify-center whitespace-nowrap rounded-radius-sm px-2.5 text-caption font-medium transition-colors duration-fast',
        'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/10',
        'disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-gray-300 disabled:hover:bg-white disabled:hover:text-gray-800',
        toneClass[tone],
        danger && 'hover:border-danger-border hover:bg-danger-subtle hover:text-danger',
        className,
      )}
      {...props}
    />
  )
}
