import { Fragment, type ReactNode } from 'react'
import { cn } from '../utils/cn'
import { useDensity, type Density } from '../density'
import { tabScale, tagScale } from '../densityScale'

export interface TabItem {
  key: string
  label: ReactNode
  /** 라벨 우측 건수 칩(참가자 풀 등 집계 탭). */
  count?: number
  /** 이 탭 앞에 세로 구분선을 그린다(그룹·권한 경계 구분용). */
  divider?: boolean
}

export interface TabsProps {
  items: TabItem[]
  value: string
  onChange: (key: string) => void
  /** 밀도 맥락 강제 지정. 생략하면 부모 Card·DataTable의 맥락을 따른다. */
  density?: Density
  className?: string
}

/**
 * 언더라인 탭 내비게이션(활성 탭 브랜드 강조 + 선택 건수 칩).
 * 상세 페이지 탭·카드 내부 필터 탭 공용. 콘텐츠 렌더링은 호출 측이 소유한다.
 */
export function Tabs({ items, value, onChange, density, className }: TabsProps) {
  const d = useDensity(density)
  const s = tabScale[d]
  const chip = tagScale[d]
  return (
    <nav
      role="tablist"
      className={cn('flex flex-wrap gap-1 border-b border-gray-200', className)}
    >
      {items.map((item) => {
        const active = item.key === value
        return (
          <Fragment key={item.key}>
            {item.divider && (
              <span aria-hidden className="mx-1.5 my-1.5 w-px self-stretch bg-gray-200" />
            )}
            <button
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onChange(item.key)}
              className={cn(
                s.height,
                s.text,
                s.padX,
                '-mb-px inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 transition-colors duration-fast',
                active
                  ? 'border-brand font-medium text-brand'
                  : 'border-transparent text-gray-600 hover:text-gray-800',
              )}
            >
              {item.label}
              {item.count != null && (
                <span
                  className={cn(
                    'inline-flex items-center justify-center rounded-full leading-none tabular-nums',
                    chip.height,
                    chip.text,
                    chip.padX,
                    active
                      ? 'bg-brand/10 font-semibold text-brand'
                      : 'bg-gray-100 text-gray-600',
                  )}
                >
                  {item.count}
                </span>
              )}
            </button>
          </Fragment>
        )
      })}
    </nav>
  )
}
