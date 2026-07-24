import { MultiSelectFilter } from '@ynarcher/ui'
import {
  EMPTY_FUND_FILTERS,
  FUND_CHARACTER_OPTIONS,
  FUND_SOURCE_OPTIONS,
  FUND_STATUS_OPTIONS,
  FUND_TYPE_OPTIONS,
  type FundListFilterState,
} from '@/features/fund/fundListHooks'

interface FundListFiltersProps {
  filters: FundListFilterState
  onChange: (next: FundListFilterState) => void
}

/**
 * 펀드 목록 필터 바: 재원구분·성격구분·상태(enum 정적 옵션) 다중선택.
 * 유형구분(AC/VC/PE)은 필터가 아니라 탭이 프리필터로 담당한다.
 */
export function FundListFilters({ filters, onChange }: FundListFiltersProps) {
  const active =
    filters.statuses.length > 0 ||
    filters.sources.length > 0 ||
    filters.characters.length > 0 ||
    filters.fundTypes.length > 0
  return (
    <div className="flex flex-wrap items-center gap-2">
      <MultiSelectFilter
        label="재원"
        options={FUND_SOURCE_OPTIONS}
        selected={filters.sources}
        onChange={(sources) => onChange({ ...filters, sources })}
      />
      <MultiSelectFilter
        label="성격"
        options={FUND_CHARACTER_OPTIONS}
        selected={filters.characters}
        onChange={(characters) => onChange({ ...filters, characters })}
      />
      <MultiSelectFilter
        label="펀드유형"
        options={FUND_TYPE_OPTIONS}
        selected={filters.fundTypes}
        onChange={(fundTypes) => onChange({ ...filters, fundTypes })}
      />
      <MultiSelectFilter
        label="상태"
        options={FUND_STATUS_OPTIONS}
        selected={filters.statuses}
        onChange={(statuses) => onChange({ ...filters, statuses })}
      />
      {active && (
        <button
          type="button"
          onClick={() => onChange(EMPTY_FUND_FILTERS)}
          className="flex h-ctl-page items-center rounded-radius-md border border-gray-300 bg-white px-3.5 text-body text-gray-700 shadow-soft transition-colors duration-fast hover:border-gray-400 hover:text-brand-700"
        >
          초기화
        </button>
      )}
    </div>
  )
}
