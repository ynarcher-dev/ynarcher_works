import { MultiSelectFilter } from '@ynarcher/ui'
import { useMemo } from 'react'
import { useTags } from '@/features/admin/hooks'
import {
  COUNTRY_TAG_TABLE,
  GLOBAL_CATEGORY_OPTIONS,
  REGION_TAG_TABLE,
} from '@/features/networks/globalConfig'
import {
  EMPTY_GLOBAL_FILTERS,
  hasActiveGlobalFilters,
  type GlobalFilterState,
} from '@/features/networks/filters'

interface GlobalNetworkFiltersProps {
  filters: GlobalFilterState
  onChange: (next: GlobalFilterState) => void
}

/**
 * 글로벌 네트워크 목록 필터 바: 권역 · 국가 · 구분.
 *
 * 국내 9종과 축이 다르다 — 글로벌은 '어디에 있는 사람인가'가 첫 질문이라 권역·국가가 앞에 온다.
 * 권역·국가는 태그 FK(id)로 거른다(이름은 조인해서 보여 줄 뿐이라 이름으로 거르면 동명 태그에서 어긋난다).
 * 구분은 DB의 category CHECK 제약과 짝인 고정 3값이라 태그 원장이 아니라 상수에서 읽는다.
 */
export function GlobalNetworkFilters({ filters, onChange }: GlobalNetworkFiltersProps) {
  const { data: regionTags } = useTags(REGION_TAG_TABLE)
  const { data: countryTags } = useTags(COUNTRY_TAG_TABLE, 'region_tag_id')

  const regionOptions = useMemo(
    () => (regionTags ?? []).map((t) => ({ value: t.id, label: t.name })),
    [regionTags],
  )
  // 권역을 고르면 국가 목록도 그 권역으로 좁힌다 — 국가는 수가 많아 전체 나열이 고르기 어렵다.
  const countryOptions = useMemo(() => {
    const all = countryTags ?? []
    const scoped = filters.regionIds.length
      ? all.filter((t) => filters.regionIds.includes(t.region_tag_id ?? ''))
      : all
    return scoped.map((t) => ({ value: t.id, label: t.name }))
  }, [countryTags, filters.regionIds])

  const categoryOptions = GLOBAL_CATEGORY_OPTIONS.map((c) => ({ value: c, label: c }))
  const active = hasActiveGlobalFilters(filters)

  return (
    <div className="flex flex-wrap items-center gap-2">
      <MultiSelectFilter
        label="권역"
        options={regionOptions}
        selected={filters.regionIds}
        onChange={(regionIds) =>
          // 권역을 바꾸면 그 권역에 없는 국가 선택은 남겨 둘 수 없다(고를 수 없는 조건이 된다).
          onChange({
            ...filters,
            regionIds,
            countryIds: filters.countryIds.filter((id) =>
              (countryTags ?? []).some(
                (t) =>
                  t.id === id &&
                  (regionIds.length === 0 || regionIds.includes(t.region_tag_id ?? '')),
              ),
            ),
          })
        }
      />
      <MultiSelectFilter
        label="국가"
        options={countryOptions}
        selected={filters.countryIds}
        onChange={(countryIds) => onChange({ ...filters, countryIds })}
      />
      <MultiSelectFilter
        label="구분"
        options={categoryOptions}
        selected={filters.categories}
        onChange={(categories) => onChange({ ...filters, categories })}
      />

      {active && (
        <button
          type="button"
          onClick={() => onChange(EMPTY_GLOBAL_FILTERS)}
          className="flex h-ctl-page items-center rounded-radius-md border border-gray-300 bg-white px-3.5 text-body text-gray-700 shadow-soft transition-colors duration-fast hover:border-gray-400 hover:text-brand-700"
        >
          초기화
        </button>
      )}
    </div>
  )
}
