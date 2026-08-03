import { DateRangeFilter, MultiSelectFilter, NumberRangeFilter } from '@ynarcher/ui'
import {
  EMPTY_FUND_FILTERS,
  FUND_CHARACTER_OPTIONS,
  FUND_SOURCE_OPTIONS,
  FUND_STATUS_OPTIONS,
  FUND_STRATEGY_FILTER_OPTIONS,
  FUND_TYPE_OPTIONS,
  hasActiveFundFilters,
  type FundListFilterState,
} from '@/features/fund/fundListHooks'

interface FundListFiltersProps {
  filters: FundListFilterState
  onChange: (next: FundListFilterState) => void
  /** 구분(전략) 탭에서 진입해 같은 축이 이미 스코프로 걸려 있으면 구분 필터를 감춘다. */
  hideStrategy?: boolean
}

/**
 * 펀드 목록 필터 바: 재원·성격·구분·펀드유형·상태(enum 정적 옵션) 다중선택 +
 * 존속기간 구간 + 잔액 범위.
 * 구분(AC/VC/PE)은 사이드바 탭도 같은 축을 프리필터로 걸므로, 그 탭에서만 칸을 내린다 —
 * '전체 펀드'·'내 펀드'에서는 구분을 물을 다른 길이 없어 필터가 필요하다.
 */
export function FundListFilters({ filters, onChange, hideStrategy }: FundListFiltersProps) {
  const active = hasActiveFundFilters(filters)
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
      {!hideStrategy && (
        <MultiSelectFilter
          label="구분"
          options={FUND_STRATEGY_FILTER_OPTIONS}
          selected={filters.strategies}
          onChange={(strategies) => onChange({ ...filters, strategies })}
        />
      )}
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

      {/* 두 칸은 한 구간의 양 끝이다 — 그 구간에 존속 중인 펀드를 남긴다. */}
      <DateRangeFilter
        fromLabel="존속 시작"
        toLabel="존속 종료"
        from={filters.termFrom}
        to={filters.termTo}
        onChange={({ from, to }) => onChange({ ...filters, termFrom: from, termTo: to })}
      />

      <NumberRangeFilter
        minLabel="최소 잔액(백만원)"
        maxLabel="최대 잔액(백만원)"
        min={filters.balanceMinMillion}
        max={filters.balanceMaxMillion}
        onChange={({ min, max }) =>
          onChange({ ...filters, balanceMinMillion: min, balanceMaxMillion: max })
        }
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
