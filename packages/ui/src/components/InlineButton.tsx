import type { ButtonHTMLAttributes } from 'react'
import { cn } from '../utils/cn'

export type InlineButtonTone = 'primary' | 'danger' | 'outline'

const toneClass: Record<InlineButtonTone, string> = {
  primary: 'bg-brand !text-white shadow-sm shadow-brand/20 hover:bg-brand-600 active:bg-brand-700',
  danger: 'bg-brand-700 !text-white shadow-sm shadow-brand/20 hover:bg-brand-800 active:bg-brand-900',
  outline:
    'border border-gray-300 bg-white text-gray-800 shadow-sm hover:border-gray-400 hover:bg-gray-25 active:bg-gray-50',
}

export interface InlineButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  tone?: InlineButtonTone
}

/**
 * 데이터 테이블 셀 전용 컴팩트 버튼. 인접한 InlineSelect와 동일한 규격
 * (h-7 · rounded-radius-sm · text-caption)으로 셀 안에서 높이가 어긋나지 않게 맞춘다.
 */
export function InlineButton({ tone = 'primary', className, type = 'button', ...props }: InlineButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex h-7 items-center justify-center rounded-radius-sm px-3 text-caption font-medium transition-colors duration-fast',
        'disabled:cursor-not-allowed disabled:opacity-50',
        toneClass[tone],
        className,
      )}
      {...props}
    />
  )
}
