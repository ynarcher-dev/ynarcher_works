import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '../utils/cn'
import { useDensity, type Density } from '../density'
import { controlScale } from '../densityScale'

export interface FilterButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** 활성(조건이 걸린) 상태. 브랜드 톤으로 강조된다. */
  active?: boolean
  /** 우측 선택 개수 배지(활성일 때만 노출). */
  count?: number
  /** 밀도 맥락 강제 지정. 생략하면 부모 맥락을 따른다. */
  density?: Density
  children: ReactNode
}

/**
 * 목록 툴바의 필터 칩 버튼. 높이·글자·여백을 controlScale에서 가져오므로 같은 줄의 검색 입력과 자동으로 맞는다.
 * `MultiSelectFilter`의 트리거와 '초기화' 버튼이 이 규격을 공유한다.
 */
export function FilterButton({
  active = false,
  count,
  density,
  className,
  children,
  type = 'button',
  ...props
}: FilterButtonProps) {
  const s = controlScale[useDensity(density)]
  return (
    <button
      type={type}
      className={cn(
        'flex items-center rounded-radius-md border shadow-soft transition-colors duration-fast',
        s.height,
        s.text,
        s.padX,
        s.gap,
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
  /** 밀도 맥락 강제 지정. 생략하면 부모 맥락을 따른다. */
  density?: Density
}

/** 필터 초기화 버튼(필터 칩과 동일 높이·톤, 활성 조건이 있을 때만 노출한다). */
export function FilterResetButton({
  onClick,
  label = '초기화',
  density,
}: FilterResetButtonProps) {
  const s = controlScale[useDensity(density)]
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center rounded-radius-md border border-gray-300 bg-white text-gray-700 shadow-soft transition-colors duration-fast hover:border-gray-400 hover:text-brand-700',
        s.height,
        s.text,
        s.padX,
      )}
    >
      {label}
    </button>
  )
}
