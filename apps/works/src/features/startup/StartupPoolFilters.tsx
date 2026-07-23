import { Input, MultiSelectFilter } from '@ynarcher/ui'
import { useTags } from '@/features/admin/hooks'
import {
  EMPTY_STARTUP_FILTERS,
  hasActiveStartupFilters,
  type StartupPoolFilters as Filters,
} from '@/features/startup/startupPoolHooks'

interface StartupPoolFiltersProps {
  filters: Filters
  onChange: (next: Filters) => void
}

/**
 * 태그 원장(*_tags)에서 옵션을 채우는 공용 다중선택 필터 래퍼.
 * 선택값은 태그명 배열이며, 목록에 없는 레거시 선택값도 체크 해제할 수 있도록 옵션에 합친다.
 */
function TagFilter({
  label,
  table,
  selected,
  onChange,
}: {
  label: string
  table: string
  selected: string[]
  onChange: (next: string[]) => void
}) {
  const { data: tags } = useTags(table)
  const names = [...new Set([...(tags ?? []).map((t) => t.name), ...selected])]
  const options = names.map((name) => ({ value: name, label: name }))
  return (
    <MultiSelectFilter label={label} options={options} selected={selected} onChange={onChange} />
  )
}

/**
 * 발굴기업 목록 복수 필터 바: 산업·단계·구분·관리현황(태그 다중선택) + 설립일 범위(From~To).
 * 상태는 상위(StartupPoolTab)가 소유하며, 본 컴포넌트는 표시·변경만 담당한다.
 */
export function StartupPoolFilters({ filters, onChange }: StartupPoolFiltersProps) {
  const active = hasActiveStartupFilters(filters)
  return (
    <div className="flex flex-wrap items-center gap-2">
      <TagFilter
        label="산업"
        table="industry_tags"
        selected={filters.industries}
        onChange={(industries) => onChange({ ...filters, industries })}
      />
      <TagFilter
        label="단계"
        table="investment_stage_tags"
        selected={filters.stages}
        onChange={(stages) => onChange({ ...filters, stages })}
      />
      {/* 구분은 탭(투자/보육/발굴/기타)이 이미 고정하므로 필터에서 제외한다. */}
      <TagFilter
        label="관리현황"
        table="company_status_tags"
        selected={filters.statuses}
        onChange={(statuses) => onChange({ ...filters, statuses })}
      />

      <div className="w-28">
        <Input
          type="number"
          min={0}
          inputMode="numeric"
          placeholder="업력(최소)"
          value={filters.ageMin}
          onChange={(e) => onChange({ ...filters, ageMin: e.target.value })}
        />
      </div>
      <div className="w-28">
        <Input
          type="number"
          min={0}
          inputMode="numeric"
          placeholder="업력(최대)"
          value={filters.ageMax}
          onChange={(e) => onChange({ ...filters, ageMax: e.target.value })}
        />
      </div>

      {active && (
        <button
          type="button"
          onClick={() => onChange(EMPTY_STARTUP_FILTERS)}
          className="flex h-ctl-page items-center rounded-radius-md border border-gray-300 bg-white px-3.5 text-body text-gray-700 shadow-soft transition-colors duration-fast hover:border-gray-400 hover:text-brand-700"
        >
          초기화
        </button>
      )}
    </div>
  )
}
