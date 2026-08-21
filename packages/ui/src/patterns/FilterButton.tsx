import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Button } from '../components/Button'
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
        'flex items-center rounded-radius-md border transition-colors duration-fast',
        'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/10',
        s.height,
        s.text,
        s.padX,
        s.gap,
        active
          ? 'border-brand/50 bg-brand/5 text-brand-700'
          : 'border-gray-300 bg-white text-gray-400 hover:bg-gray-50 active:bg-gray-100',
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

/**
 * 필터 초기화 버튼(필터 칩과 동일 높이·톤, 활성 조건이 있을 때만 노출한다).
 *
 * 외형을 손수 그리지 않고 `Button`의 outline을 그대로 쓴다 — 이 버튼이 하는 일은 '초기화'라는
 * 라벨과 노출 조건을 정하는 것뿐이고, 테두리·호버·포커스는 정본(§5.1)이 이미 답한 문제다.
 * 손수 그리던 시절에는 이 클래스 문자열이 앱 곳곳에 다섯 벌 복제돼 여백이 제각각이었다.
 */
export function FilterResetButton({
  onClick,
  label = '초기화',
  density,
}: FilterResetButtonProps) {
  return (
    <Button variant="outline" density={density} onClick={onClick}>
      {label}
    </Button>
  )
}
