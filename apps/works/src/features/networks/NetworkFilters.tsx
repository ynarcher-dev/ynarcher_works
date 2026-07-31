import { MultiSelectFilter } from '@ynarcher/ui'
import { useMemo } from 'react'
import { useTags } from '@/features/admin/hooks'
import { isCompactEntity, type EntityKey } from '@/features/networks/config'
import {
  EMPTY_NETWORK_FILTERS,
  MATCH_FILTER_OPTIONS,
  hasActiveNetworkFilters,
  type NetworkFilterState,
} from '@/features/networks/filters'

interface NetworkFiltersProps {
  entity: EntityKey
  filters: NetworkFilterState
  onChange: (next: NetworkFilterState) => void
}

/**
 * 국내 네트워크 목록 필터 바.
 *
 * 노출 축을 엔티티가 정한다 — 프로필형(전문가·BAN·EXP·투자사)은 구분·분야·매칭 셋을 갖고,
 * 조직형(기업·기관·대학·기타)과 미분류는 구분 하나만 갖는다. 조직형 목록에는 분야·매칭 열이
 * 아예 없어서(networkProfileColumns의 ORG_OMIT_COLUMNS), 그 축으로 거르면 왜 걸러졌는지
 * 표에서 확인할 방법이 없다.
 *
 * 선택지는 ADMIN 태그 원장에서 읽는다(코드에 목록을 박지 않는다) — 구분은 category_tags,
 * 분야는 field_tags.
 */
export function NetworkFilters({ entity, filters, onChange }: NetworkFiltersProps) {
  const compact = isCompactEntity(entity)
  const { data: categoryTags } = useTags('category_tags')
  const { data: fieldTags } = useTags('field_tags', undefined, !compact)

  const categoryOptions = useMemo(
    () => (categoryTags ?? []).map((t) => ({ value: t.name, label: t.name })),
    [categoryTags],
  )
  const fieldOptions = useMemo(
    () => (fieldTags ?? []).map((t) => ({ value: t.name, label: t.name })),
    [fieldTags],
  )

  const active = hasActiveNetworkFilters(filters)

  return (
    <div className="flex flex-wrap items-center gap-2">
      <MultiSelectFilter
        label="구분"
        options={categoryOptions}
        selected={filters.categories}
        onChange={(categories) => onChange({ ...filters, categories })}
      />

      {!compact && (
        <>
          <MultiSelectFilter
            label="분야"
            options={fieldOptions}
            selected={filters.expertise}
            onChange={(expertise) => onChange({ ...filters, expertise })}
          />
          <MultiSelectFilter
            label="매칭"
            options={MATCH_FILTER_OPTIONS}
            selected={filters.match}
            onChange={(match) => onChange({ ...filters, match })}
          />
        </>
      )}

      {active && (
        <button
          type="button"
          onClick={() => onChange(EMPTY_NETWORK_FILTERS)}
          className="flex h-ctl-page items-center rounded-radius-md border border-gray-300 bg-white px-3.5 text-body text-gray-700 shadow-soft transition-colors duration-fast hover:border-gray-400 hover:text-brand-700"
        >
          초기화
        </button>
      )}
    </div>
  )
}
