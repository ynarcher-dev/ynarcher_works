import { Input, MultiSelectFilter } from '@ynarcher/ui'
import { PROGRAM_STATUS_LABEL, PROGRAM_STATUS_OPTIONS } from '@/features/program/config'
import {
  EMPTY_PROGRAM_FILTERS,
  hasActiveProgramFilters,
  type ProgramFilters as Filters,
} from '@/features/program/programsPoolHooks'

interface ProgramFiltersProps {
  filters: Filters
  onChange: (next: Filters) => void
}

/** 상태(대기/진행중/종료/취소) 고정 옵션. */
const STATUS_OPTIONS = PROGRAM_STATUS_OPTIONS.map((value) => ({
  value,
  label: PROGRAM_STATUS_LABEL[value] ?? value,
}))

/**
 * 프로그램 목록 복수 필터 바: 상태(다중선택) + 시작일 범위(From~To).
 * 상태는 상위(AcWorkspaceTab)가 소유하며, 본 컴포넌트는 표시·변경만 담당한다.
 */
export function ProgramFilters({ filters, onChange }: ProgramFiltersProps) {
  const active = hasActiveProgramFilters(filters)
  return (
    <div className="flex flex-wrap items-center gap-2">
      <MultiSelectFilter
        label="상태"
        options={STATUS_OPTIONS}
        selected={filters.statuses}
        onChange={(statuses) => onChange({ ...filters, statuses })}
      />

      <div className="w-40">
        <Input
          type="date"
          aria-label="시작일(부터)"
          value={filters.startFrom}
          onChange={(e) => onChange({ ...filters, startFrom: e.target.value })}
        />
      </div>
      <span className="text-caption text-gray-400">~</span>
      <div className="w-40">
        <Input
          type="date"
          aria-label="시작일(까지)"
          value={filters.startTo}
          onChange={(e) => onChange({ ...filters, startTo: e.target.value })}
        />
      </div>

      {active && (
        <button
          type="button"
          onClick={() => onChange(EMPTY_PROGRAM_FILTERS)}
          className="flex h-ctl-page items-center rounded-radius-md border border-gray-300 bg-white px-3.5 text-body text-gray-700 shadow-soft transition-colors duration-fast hover:border-gray-400 hover:text-brand-700"
        >
          초기화
        </button>
      )}
    </div>
  )
}
