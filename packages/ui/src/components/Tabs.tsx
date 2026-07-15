import type { ReactNode } from 'react'
import { cn } from '../utils/cn'

export interface TabItem {
  key: string
  label: ReactNode
  /** 라벨 우측 건수 칩(참가자 풀 등 집계 탭). */
  count?: number
}

export interface TabsProps {
  items: TabItem[]
  value: string
  onChange: (key: string) => void
  /** sm: 카드 내부용 컴팩트 밀도. 기본 md. */
  size?: 'md' | 'sm'
  className?: string
}

/**
 * 언더라인 탭 내비게이션(활성 탭 브랜드 강조 + 선택 건수 칩).
 * 상세 페이지 탭·카드 내부 필터 탭 공용. 콘텐츠 렌더링은 호출 측이 소유한다.
 */
export function Tabs({ items, value, onChange, size = 'md', className }: TabsProps) {
  const pad = size === 'sm' ? 'px-2.5 py-1.5' : 'px-3 py-2'
  return (
    <nav
      role="tablist"
      className={cn('flex flex-wrap gap-1 border-b border-gray-200', className)}
    >
      {items.map((item) => {
        const active = item.key === value
        return (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(item.key)}
            className={cn(
              pad,
              '-mb-px inline-flex items-center gap-1.5 border-b-2 text-body transition-colors duration-fast',
              active
                ? 'border-brand font-medium text-brand'
                : 'border-transparent text-gray-500 hover:text-gray-800',
            )}
          >
            {item.label}
            {item.count != null && (
              <span
                className={cn(
                  'rounded-full px-1.5 py-0.5 text-caption tabular-nums',
                  active
                    ? 'bg-brand/10 font-semibold text-brand'
                    : 'bg-gray-100 text-gray-500',
                )}
              >
                {item.count}
              </span>
            )}
          </button>
        )
      })}
    </nav>
  )
}
