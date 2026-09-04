import { FilterResetButton, Input, MultiSelectFilter } from '@ynarcher/ui'
import { useMemo } from 'react'
import { useTags } from '@/features/admin/hooks'
import { useCountryOptions } from '@/features/networks/countryOptions'
import {
  CATEGORY_LABEL,
  CATEGORY_ORDER,
  REGION_SCOPE_OPTIONS,
  REGION_TAG_TABLE,
} from '@/features/networks/config'
import {
  EMPTY_NETWORK_FILTERS,
  MATCH_FILTER_OPTIONS,
  hasActiveNetworkFilters,
  showsOverseasAxes,
  type NetworkFilterState,
} from '@/features/networks/filters'

interface NetworkListFiltersProps {
  filters: NetworkFilterState
  onChange: (next: NetworkFilterState) => void
  /** 미분류 목록처럼 구분이 이미 고정된 화면에서는 구분 축을 세우지 않는다. */
  showCategory?: boolean
}

/**
 * 통합 목록 필터 바(검색창 오른쪽에 같은 줄로 선다).
 *
 * 축 순서는 표의 열 순서를 따른다 — 지역 → (권역·국가) → 구분 → 영역 → 활동 → 매칭.
 * 지역이 구분보다 앞에 서는 것은 좁혀 가는 순서가 어디 사람인가 → 어떤 구분인가 →
 * 무엇을 하는가이기 때문이고, 표의 열도 같은 순서다(2026-09-04).
 * 구분과 지역이 직교한 두 축이라 '해외의 대학'처럼 두 축을 함께 걸 수 있다(2026-09-04 통합
 * 이전에는 해외가 원장 하나였고 그 안의 구분이 3값뿐이라 이 조합 자체가 없었다).
 *
 * 권역·국가는 해외 행에만 있는 값이라, 지역을 국내로 좁히면 축에서 내린다 — 어떤 값을
 * 골라도 결과가 0건이 되는 칸은 고를 수 있다고 말하는 죽은 컨트롤이다. 권역·국가는 태그
 * FK(id)로 거른다(이름으로 거르면 동명 태그에서 어긋난다).
 *
 * 영역 선택지는 ADMIN 태그 원장(field_tags)에서 읽는다(코드에 목록을 박지 않는다).
 */
export function NetworkListFilters({
  filters,
  onChange,
  showCategory = true,
}: NetworkListFiltersProps) {
  const { data: fieldTags } = useTags('field_tags')
  const { data: regionTags } = useTags(REGION_TAG_TABLE)
  const { data: countries } = useCountryOptions()

  // 은퇴 구분(vendors)은 새로 고를 이유가 없어 선택지에서만 빠지고 목록에는 그대로 담긴다.
  // 라벨은 구분 이름 그대로다 — 필터 이름이 이미 '구분'이라 항목마다 '네트워크'를 붙이면
  // 같은 말이 두 번 서고, 표의 구분 열에 찍히는 값과도 표기가 어긋난다.
  const categoryOptions = useMemo(
    () => CATEGORY_ORDER.map((key) => ({ value: key, label: CATEGORY_LABEL[key] })),
    [],
  )

  const fieldOptions = useMemo(
    () => (fieldTags ?? []).map((t) => ({ value: t.name, label: t.name })),
    [fieldTags],
  )

  const regionOptions = useMemo(
    () => (regionTags ?? []).map((t) => ({ value: t.id, label: t.name })),
    [regionTags],
  )

  // 국가 선택지는 자국을 맨 앞에 두고 나머지는 가나다순이다(useCountryOptions).
  // 권역을 고르면 그 권역의 국가로 좁힌다 — 국가는 수가 많아 전체 나열이 고르기 어렵다.
  const allCountries = useMemo(
    () => [...(countries?.domestic ?? []), ...(countries?.overseas ?? [])],
    [countries],
  )
  const countryOptions = useMemo(() => {
    const scoped = filters.regionIds.length
      ? allCountries.filter((t) => filters.regionIds.includes(t.region_tag_id ?? ''))
      : allCountries
    return scoped.map((t) => ({ value: t.id, label: t.name }))
  }, [allCountries, filters.regionIds])

  const overseas = showsOverseasAxes(filters)
  const active = hasActiveNetworkFilters(filters)

  return (
    <div className="flex flex-wrap items-center gap-2">
      <MultiSelectFilter
        label="지역"
        options={REGION_SCOPE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
        selected={filters.regionScopes}
        onChange={(regionScopes) =>
          // 국내로 좁히면 권역·국가 조건은 남겨 둘 수 없다 — 국내 행에는 그 값이 없어
          // 조건이 남아 있으면 결과가 통째로 비고 그 이유가 화면에 보이지 않는다.
          onChange(
            regionScopes.length === 1 && regionScopes[0] === 'DOMESTIC'
              ? { ...filters, regionScopes, regionIds: [], countryIds: [] }
              : { ...filters, regionScopes },
          )
        }
      />

      {overseas && (
        <>
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
                  allCountries.some(
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
        </>
      )}

      {showCategory && (
        <MultiSelectFilter
          label="구분"
          options={categoryOptions}
          selected={filters.categories}
          onChange={(categories) => onChange({ ...filters, categories })}
        />
      )}

      <MultiSelectFilter
        label="영역"
        options={fieldOptions}
        selected={filters.expertise}
        onChange={(expertise) => onChange({ ...filters, expertise })}
      />

      {/* 활동은 값이 연속이라 선택지로 나눌 수 없다 — 최소~최대 두 칸으로 받는다.
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

      <MultiSelectFilter
        label="매칭"
        options={MATCH_FILTER_OPTIONS}
        selected={filters.match}
        onChange={(match) => onChange({ ...filters, match })}
      />

      {active && <FilterResetButton onClick={() => onChange(EMPTY_NETWORK_FILTERS)} />}
    </div>
  )
}
