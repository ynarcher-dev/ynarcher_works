import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '../utils/cn'

export interface FilterButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** 활성(조건이 걸린) 상태. 브랜드 톤으로 강조된다. */
  active?: boolean
  /** 우측 선택 개수 배지(활성일 때만 노출). */
  count?: number
  children: ReactNode
}

/**
 * 목록 툴바의 필터 칩 버튼(높이 h-11로 검색 입력과 라인을 맞춘다).
 * `MultiSelectFilter`의 트리거와 '초기화' 버튼이 이 규격을 공유한다.
 */
export function FilterButton({
  active = false,
  count,
  className,
  children,
  type = 'button',
  ...props
}: FilterButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        'flex h-11 items-center gap-1 rounded-radius-md border px-3.5 text-body shadow-soft transition-colors duration-fast',
        active
          ? 'border-brand/50 bg-brand/5 text-brand-700'
          : 'border-gray-300 bg-white text-gray-400 hover:border-gray-400',
        className,
      )}
      {...props}
    >
      {children}
      {active && count !== undefined && count > 0 && (
        <span className="ml-0.5 inline-flex min-w-5 justify-center rounded-full bg-brand px-1.5 text-caption font-semibold text-white">
          {count}
        </span>
      )}
    </button>
  )
}

export interface FilterResetButtonProps {
  onClick: () => void
  label?: string
}

/** 필터 초기화 버튼(필터 칩과 동일 높이·톤, 활성 조건이 있을 때만 노출한다). */
export function FilterResetButton({
  onClick,
  label = '초기화',
}: FilterResetButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-11 items-center rounded-radius-md border border-gray-300 bg-white px-3.5 text-body text-gray-700 shadow-soft transition-colors duration-fast hover:border-gray-400 hover:text-brand-700"
    >
      {label}
    </button>
  )
}
