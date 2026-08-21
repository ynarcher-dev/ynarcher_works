import { FilterResetButton, Input, MultiSelectFilter } from '@ynarcher/ui'
import { useTags } from '@/features/admin/hooks'
import {
  EMPTY_STARTUP_FILTERS,
  hasActiveStartupFilters,
  type StartupPoolFilters as Filters,
} from '@/features/startup/startupPoolHooks'
import { MANAGEMENT_STATUS_OPTIONS } from '@/features/startup/startupClassification'

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
 * 기업 목록 복수 필터 바: 소재지·분야·단계·구분·관리현황(다중선택) + 업력 범위(최소~최대).
 * 상태는 상위(StartupPoolTab)가 소유하며, 본 컴포넌트는 표시·변경만 담당한다.
 * 필터 순서는 표의 열 순서(소재지 → 분야 → 단계 → 구분 → 관리현황)를 그대로 따른다.
 */
export function StartupPoolFilters({ filters, onChange }: StartupPoolFiltersProps) {
  const active = hasActiveStartupFilters(filters)
  return (
    <div className="flex flex-wrap items-center gap-2">
      <TagFilter
        label="소재지"
        table="location_tags"
        selected={filters.locations}
        onChange={(locations) => onChange({ ...filters, locations })}
      />
      <TagFilter
        label="분야"
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
      {/*
        구분(management_status)은 사이드바 메뉴가 아니라 이 필터가 답한다(2026-08-20). 태그 원장이
        아니라 코드 4종으로 고정된 값이라 TagFilter가 아닌 고정 옵션 다중선택이다.
      */}
      <MultiSelectFilter
        label="구분"
        options={MANAGEMENT_STATUS_OPTIONS}
        selected={filters.categories}
        onChange={(categories) => onChange({ ...filters, categories })}
      />
      {/*
        관리현황(pool_status)은 투자기업에서만 채워지는 값이지만, 구분이 섞인 목록에는 투자기업이
        함께 있으므로 항상 둔다 — 구분 필터로 비투자만 좁혔을 때 결과가 비는 것은 값 자체의 의미다.
      */}
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
        <FilterResetButton onClick={() => onChange(EMPTY_STARTUP_FILTERS)} />
      )}
    </div>
  )
}
