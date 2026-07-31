import { MultiSelectFilter } from '@ynarcher/ui'
import { useMemo } from 'react'
import { useTags } from '@/features/admin/hooks'
import { DIRECTORY_ENTITIES, ENTITIES } from '@/features/networks/config'
import {
  EMPTY_MY_NETWORK_FILTERS,
  hasActiveMyNetworkFilters,
  type MyNetworkFilterState,
} from '@/features/networks/filters'

interface MyNetworkFiltersProps {
  filters: MyNetworkFilterState
  onChange: (next: MyNetworkFilterState) => void
}

/**
 * 내 네트워크(10종 통합) 목록 필터 바: 네트워크 종류 · 구분.
 *
 * 다른 목록과 첫 축이 다르다 — 여기서만 원장이 섞여 있으므로 '어느 네트워크인가'가 먼저다.
 * 분야·매칭은 이 목록의 컬럼 구성(조직형 공용 컬럼)에 없어 축으로 두지 않는다.
 */
export function MyNetworkFilters({ filters, onChange }: MyNetworkFiltersProps) {
  const { data: categoryTags } = useTags('category_tags')

  // 종류 선택지는 디렉토리 정의에서 파생한다(원장이 늘어도 이 파일은 손대지 않는다).
  const entityOptions = useMemo(
    () =>
      DIRECTORY_ENTITIES.map((key) => ({
        value: key,
        label: key === 'others' ? '미분류' : `${ENTITIES[key].label} 네트워크`,
      })),
    [],
  )
  const categoryOptions = useMemo(
    () => (categoryTags ?? []).map((t) => ({ value: t.name, label: t.name })),
    [categoryTags],
  )

  const active = hasActiveMyNetworkFilters(filters)

  return (
    <div className="flex flex-wrap items-center gap-2">
      <MultiSelectFilter
        label="네트워크"
        options={entityOptions}
        selected={filters.entities}
        onChange={(entities) => onChange({ ...filters, entities })}
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
          onClick={() => onChange(EMPTY_MY_NETWORK_FILTERS)}
          className="flex h-ctl-page items-center rounded-radius-md border border-gray-300 bg-white px-3.5 text-body text-gray-700 shadow-soft transition-colors duration-fast hover:border-gray-400 hover:text-brand-700"
        >
          초기화
        </button>
      )}
    </div>
  )
}
