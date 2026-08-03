import { Input, MultiSelectFilter } from '@ynarcher/ui'
import { useTags } from '@/features/admin/hooks'
import {
  EMPTY_STARTUP_FILTERS,
  hasActiveStartupFilters,
  type StartupPoolFilters as Filters,
} from '@/features/startup/startupPoolHooks'
import { isInvested, type ManagementStatus } from '@/features/startup/startupClassification'

interface StartupPoolFiltersProps {
  filters: Filters
  onChange: (next: Filters) => void
  /**
   * 탭 고정 구분(코드). null이면 구분이 섞인 뷰('내 기업 관리'·'전체 기업').
   * 관리현황 필터의 노출 여부만 좌우한다 — 열 구성은 탭과 무관하게 하나로 통일되어 있다.
   */
  category?: ManagementStatus | null
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
 * 발굴기업 목록 복수 필터 바: 소재지·분야·단계·관리현황(태그 다중선택) + 업력 범위(최소~최대).
 * 상태는 상위(StartupPoolTab)가 소유하며, 본 컴포넌트는 표시·변경만 담당한다.
 * 필터 순서는 표의 열 순서(소재지 → 분야 → 단계 → 관리현황)를 그대로 따른다.
 */
export function StartupPoolFilters({ filters, onChange, category = null }: StartupPoolFiltersProps) {
  const active = hasActiveStartupFilters(filters)
  // 관리현황(pool_status)은 투자기업에서만 채워지는 값이라, 구분이 보육·발굴·기타로 고정된
  // 탭에서는 어떤 값을 골라도 결과가 비어 고를 이유가 없다 → 그 탭에서만 필터를 내린다.
  // 구분이 섞인 뷰(category=null)에는 투자기업이 함께 있으므로 그대로 둔다.
  const showStatusFilter = category === null || isInvested(category)
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
      {/* 구분은 탭(투자/보육/발굴/기타)이 이미 고정하므로 필터에서 제외한다. */}
      {showStatusFilter && (
        <TagFilter
          label="관리현황"
          table="company_status_tags"
          selected={filters.statuses}
          onChange={(statuses) => onChange({ ...filters, statuses })}
        />
      )}

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
