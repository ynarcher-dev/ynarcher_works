import { Input, MultiSelectFilter } from '@ynarcher/ui'
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
 * 국내 네트워크 목록 필터 바(검색창 오른쪽에 같은 줄로 선다).
 *
 * 노출 축을 엔티티가 정한다 — 프로필형(전문가·BAN·EXP·투자사)은 분야·매칭·활동·만족도를 갖고,
 * 조직형(기업·기관·대학·기타)과 미분류는 축이 없어 아무것도 렌더하지 않는다. 그 목록에는
 * 해당 열이 아예 없어서(networkProfileColumns의 ORG_OMIT_COLUMNS) 그 축으로 거르면 왜
 * 걸러졌는지 표에서 확인할 방법이 없다.
 *
 * 구분은 여기 두지 않는다 — 목록 하나가 곧 구분 하나라 어느 값을 골라도 결과가 그대로거나 0건이다
 * (구분이 결과를 가르는 목록은 내 네트워크·글로벌 네트워크뿐이며 각자 자기 필터 바가 갖는다).
 *
 * 선택지는 ADMIN 태그 원장(field_tags)에서 읽는다(코드에 목록을 박지 않는다).
 */
export function NetworkFilters({ entity, filters, onChange }: NetworkFiltersProps) {
  const compact = isCompactEntity(entity)
  const { data: fieldTags } = useTags('field_tags', undefined, !compact)

  const fieldOptions = useMemo(
    () => (fieldTags ?? []).map((t) => ({ value: t.name, label: t.name })),
    [fieldTags],
  )

  const active = hasActiveNetworkFilters(filters)

  // 조직형·미분류는 거를 축이 없다. 빈 래퍼를 남기면 검색창 옆에 빈 간격만 생긴다.
  if (compact) return null

  return (
    <div className="flex flex-wrap items-center gap-2">
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

      {/* 활동·만족도는 값이 연속이라 선택지로 나눌 수 없다 — 최소~최대 두 칸으로 받는다.
          한쪽만 채우면 그쪽만 경계가 된다(빈 칸 = 경계 없음).
          폭은 자리표시자가 잘리지 않는 값이 기준이다 — 숫자 입력은 오른쪽 증감 화살표가
          글자 자리를 먹어서 같은 글자 수라도 텍스트 입력보다 넓어야 한다. */}
      <div className="w-32">
        <Input
          type="number"
          min={0}
          inputMode="numeric"
          placeholder="활동(최소)"
          value={filters.activityMin}
          onChange={(e) => onChange({ ...filters, activityMin: e.target.value })}
        />
      </div>
      <div className="w-32">
        <Input
          type="number"
          min={0}
          inputMode="numeric"
          placeholder="활동(최대)"
          value={filters.activityMax}
          onChange={(e) => onChange({ ...filters, activityMax: e.target.value })}
        />
      </div>
      <div className="w-36">
        <Input
          type="number"
          min={0}
          max={5}
          step={0.1}
          inputMode="decimal"
          placeholder="만족도(최소)"
          value={filters.satisfactionMin}
          onChange={(e) => onChange({ ...filters, satisfactionMin: e.target.value })}
        />
      </div>
      <div className="w-36">
        <Input
          type="number"
          min={0}
          max={5}
          step={0.1}
          inputMode="decimal"
          placeholder="만족도(최대)"
          value={filters.satisfactionMax}
          onChange={(e) => onChange({ ...filters, satisfactionMax: e.target.value })}
        />
      </div>

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
