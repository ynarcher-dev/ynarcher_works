import {
  FilterResetButton,
  ListToolbar,
  MultiSelectFilter,
  Select,
  type FilterOption,
} from '@ynarcher/ui'
import type { ReactNode } from 'react'
import {
  EMPTY_ATTENDANCE_FILTERS,
  hasActiveAttendanceFilters,
  type AttendanceFilters,
} from '@/features/management/attendance/attendanceFilters'
import {
  PLACE_LABELS,
  type AttendancePlace,
} from '@/features/management/attendance/attendanceModel'

/** 근무지 선택지. 표의 값 표기와 같은 글자를 쓴다(필터와 표가 다른 말을 하지 않게). */
const PLACE_OPTIONS: FilterOption[] = (Object.keys(PLACE_LABELS) as AttendancePlace[]).map(
  (value) => ({ value, label: PLACE_LABELS[value] }),
)

interface Props {
  /**
   * 인력별 뷰의 대상 선택. null이면 날짜별 뷰라 이름 검색과 소속 필터가 대신 선다.
   * 두 뷰가 조건의 자리를 공유하되, 축에 없는 조건은 아예 세우지 않는다 — 한 사람만 보는 화면에서
   * 이름 검색과 소속은 고를 것이 하나뿐이라 조건이 되지 못한다.
   */
  person: {
    id: string
    options: { id: string; name: string }[]
    onChange: (id: string) => void
  } | null
  keyword: string
  onKeywordChange: (value: string) => void
  filters: AttendanceFilters
  onFiltersChange: (next: AttendanceFilters) => void
  /** 상태 선택지(원장 + 미출근). 값 체계는 요약 타일과 공유한다. */
  statusOptions: FilterOption[]
  /** 소속 선택지. 그날 표에 실제로 선 소속만 담는다. */
  affiliationOptions: FilterOption[]
  /** 우측 끝 화면 액션(근태 설정 등). */
  actions?: ReactNode
}

/**
 * 근태 목록 컨트롤 행 — 검색(또는 대상 선택) + 필터 + 우측 액션.
 * 자리와 규격은 다른 원장 목록(자산·AC 사업)과 같은 `ListToolbar`를 그대로 쓴다.
 */
export function AttendanceToolbar({
  person,
  keyword,
  onKeywordChange,
  filters,
  onFiltersChange,
  statusOptions,
  affiliationOptions,
  actions,
}: Props) {
  return (
    <ListToolbar
      // 인력별 뷰에서는 검색 자리를 대상 선택이 가져간다(아래 filters 슬롯 첫 칸).
      keyword={person ? undefined : keyword}
      onKeywordChange={onKeywordChange}
      searchPlaceholder="임직원 이름 검색"
      actions={actions}
      filters={
        <>
          {person && (
            <div className="w-full sm:w-64">
              <Select
                aria-label="임직원 선택"
                value={person.id}
                onChange={(e) => person.onChange(e.target.value)}
              >
                <option value="">임직원 선택</option>
                {person.options.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </Select>
            </div>
          )}
          <MultiSelectFilter
            label="상태"
            options={statusOptions}
            selected={filters.statuses}
            onChange={(statuses) => onFiltersChange({ ...filters, statuses })}
          />
          {!person && (
            <MultiSelectFilter
              label="소속"
              options={affiliationOptions}
              selected={filters.affiliations}
              onChange={(affiliations) => onFiltersChange({ ...filters, affiliations })}
            />
          )}
          <MultiSelectFilter
            label="근무지"
            options={PLACE_OPTIONS}
            selected={filters.places}
            onChange={(places) => onFiltersChange({ ...filters, places })}
          />
          {hasActiveAttendanceFilters(filters) && (
            <FilterResetButton onClick={() => onFiltersChange(EMPTY_ATTENDANCE_FILTERS)} />
          )}
        </>
      }
    />
  )
}
