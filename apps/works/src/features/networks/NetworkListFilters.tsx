import { Input, MultiSelectFilter } from '@ynarcher/ui'
import { useMemo } from 'react'
import { useTags } from '@/features/admin/hooks'
import { DOMESTIC_LIST_ENTITIES, ENTITIES } from '@/features/networks/config'
import {
  EMPTY_NETWORK_LIST_FILTERS,
  MATCH_FILTER_OPTIONS,
  hasActiveNetworkListFilters,
  type NetworkListFilterState,
} from '@/features/networks/filters'

interface NetworkListFiltersProps {
  filters: NetworkListFilterState
  onChange: (next: NetworkListFilterState) => void
}

/**
 * 국내 통합 목록 필터 바(검색창 오른쪽에 같은 줄로 선다).
 *
 * 축 순서는 표의 열 순서를 따른다 — 구분 → 영역 → 활동 → 만족도 → 매칭.
 * 첫 축은 이 목록에만 있다: 원장이 섞여 있으므로 '어느 구분인가'로 좁힐 수 있다. 값은 원장
 * 테이블명으로 거르되 화면에는 구분 이름만 보인다 — `profile.category`를 따로 축으로 두지
 * 않는 이유도 그 값이 곧 원장 라벨이라 같은 것을 두 번 묻게 되기 때문이다.
 *
 * 나머지 넷은 2026-08-20에 폐지된 원장별 목록에서 그대로 옮겨 왔다. 조직형(기업·기관·대학·
 * 기타) 행은 그 열이 비어 있어 이 축으로 거르면 자연히 빠지며, 그것이 이 축들의 뜻이다 —
 * '영역이 핀테크인 사람'을 물으면 영역 자체가 없는 조직 담당자는 답이 아니다.
 *
 * 영역 선택지는 ADMIN 태그 원장(field_tags)에서 읽는다(코드에 목록을 박지 않는다).
 */
export function NetworkListFilters({ filters, onChange }: NetworkListFiltersProps) {
  const { data: fieldTags } = useTags('field_tags')

  // 선택지는 국내 목록이 담는 원장에서 파생한다(원장이 늘어도 이 파일은 손대지 않는다).
  // 은퇴 원장(vendors)은 새로 고를 이유가 없어 선택지에서만 빼고 목록에는 그대로 담긴다.
  // 라벨은 구분 이름 그대로다 — 필터 이름이 이미 '구분'이라 항목마다 '네트워크'를 붙이면
  // 같은 말이 두 번 서고, 표의 구분 열에 찍히는 값과도 표기가 어긋난다.
  const entityOptions = useMemo(
    () =>
      DOMESTIC_LIST_ENTITIES.filter((key) => key !== 'vendors').map((key) => ({
        value: key,
        label: ENTITIES[key].label,
      })),
    [],
  )

  const fieldOptions = useMemo(
    () => (fieldTags ?? []).map((t) => ({ value: t.name, label: t.name })),
    [fieldTags],
  )

  const active = hasActiveNetworkListFilters(filters)

  return (
    <div className="flex flex-wrap items-center gap-2">
      <MultiSelectFilter
        label="구분"
        options={entityOptions}
        selected={filters.entities}
        onChange={(entities) => onChange({ ...filters, entities })}
      />
      <MultiSelectFilter
        label="영역"
        options={fieldOptions}
        selected={filters.expertise}
        onChange={(expertise) => onChange({ ...filters, expertise })}
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

      <MultiSelectFilter
        label="매칭"
        options={MATCH_FILTER_OPTIONS}
        selected={filters.match}
        onChange={(match) => onChange({ ...filters, match })}
      />

      {active && (
        <button
          type="button"
          onClick={() => onChange(EMPTY_NETWORK_LIST_FILTERS)}
          className="flex h-ctl-page items-center rounded-radius-md border border-gray-300 bg-white px-3.5 text-body text-gray-700 shadow-soft transition-colors duration-fast hover:border-gray-400 hover:text-brand-700"
        >
          초기화
        </button>
      )}
    </div>
  )
}
