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
  /**
   * 검색창을 한 단 좁힌다(`w-80` → `w-64`). 필터 축이 많아 한 줄이 빠듯한 툴바용이며,
   * 열이 많은 표가 여백을 좁히는 `DataTable`의 `dense`와 같은 사정·같은 이름이다.
   *
   * 좁히는 쪽이 검색창인 이유는 폭이 값에서 따라 나오지 않는 유일한 칸이기 때문이다 —
   * 필터 칸은 저마다 담는 값(날짜·금액·라벨)이 폭을 정하지만 검색창은 그렇지 않아, 줄일 때
   * 잃는 것이 placeholder의 여유뿐이다. 액션이 아래 줄로 밀리면 "지금 무엇으로 좁히고
   * 있는가"와 "무엇을 새로 만드는가"가 두 층으로 갈려 툴바가 한 덩어리로 읽히지 않는다.
   */
  dense?: boolean
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
  dense,
  className,
}: ListToolbarProps) {
  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      {keyword !== undefined && (
        <div className={cn('w-full', dense ? 'sm:w-64' : 'sm:w-80')}>
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
