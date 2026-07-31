import { MultiSelectFilter } from '@ynarcher/ui'
import { useMemo } from 'react'
import { DIRECTORY_ENTITIES, ENTITIES } from '@/features/networks/config'
import {
  EMPTY_MY_NETWORK_FILTERS,
  GLOBAL_ENTITY_KEY,
  hasActiveMyNetworkFilters,
  type MyNetworkFilterState,
} from '@/features/networks/filters'

interface MyNetworkFiltersProps {
  filters: MyNetworkFilterState
  onChange: (next: MyNetworkFilterState) => void
}

/**
 * 내 네트워크(디렉토리 10종 + 글로벌) 목록 필터 바: 네트워크 종류 하나.
 *
 * 다른 목록과 첫 축이 다르다 — 여기서만 원장이 섞여 있으므로 '어느 네트워크인가'가 축이다.
 * 구분은 이 축과 같은 것을 묻는 중복이라 두지 않고(filters.ts 참조), 분야·매칭은 이 목록의
 * 컬럼 구성(조직형 공용 컬럼)에 없어 축으로 두지 않는다.
 */
export function MyNetworkFilters({ filters, onChange }: MyNetworkFiltersProps) {
  // 선택지는 디렉토리 정의에서 파생한다(원장이 늘어도 이 파일은 손대지 않는다).
  // 글로벌은 EntityKey 밖의 단일 원장이라 뒤에 따로 붙인다.
  const entityOptions = useMemo(
    () => [
      ...DIRECTORY_ENTITIES.map((key) => ({
        value: key,
        label: key === 'others' ? '미분류' : `${ENTITIES[key].label} 네트워크`,
      })),
      { value: GLOBAL_ENTITY_KEY, label: '글로벌 네트워크' },
    ],
    [],
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
