import type { ReactNode } from 'react'
import { Input } from '../components/Input'
import { cn } from '../utils/cn'

export interface ListToolbarProps {
  /** 검색어(controlled). 미지정 시 검색 입력을 렌더하지 않는다. */
  keyword?: string
  onKeywordChange?: (value: string) => void
  searchPlaceholder?: string
  /** 검색 입력 우측 필터 영역(`MultiSelectFilter`·`DateRangeFilter` 등). */
  filters?: ReactNode
  /** 우측 끝 액션(등록 버튼 등). */
  actions?: ReactNode
  className?: string
}

/**
 * 원장 목록 상단 컨트롤 행(검색 + 필터 + 우측 액션).
 * 검색창과 필터를 한 줄에 배치하는 목록 화면(AC 사업·M&A·프로젝트) 공통 규격이다.
 */
export function ListToolbar({
  keyword,
  onKeywordChange,
  searchPlaceholder = '검색',
  filters,
  actions,
  className,
}: ListToolbarProps) {
  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      {keyword !== undefined && (
        <div className="w-full sm:w-80">
          <Input
            placeholder={searchPlaceholder}
            value={keyword}
            onChange={(e) => onKeywordChange?.(e.target.value)}
          />
        </div>
      )}
      {filters}
      {actions && <div className="sm:ml-auto">{actions}</div>}
    </div>
  )
}
