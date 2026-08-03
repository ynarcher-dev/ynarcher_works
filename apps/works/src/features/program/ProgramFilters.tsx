import { DateRangeFilter, MultiSelectFilter } from '@ynarcher/ui'
import { useMemo } from 'react'
import { useDepartmentOptions } from '@/features/management/departmentOptions'
import { PROGRAM_STATUS_LABEL, programStatusOptions } from '@/features/program/config'
import {
  EMPTY_PROGRAM_FILTERS,
  hasActiveProgramFilters,
  type ProgramFilters as Filters,
} from '@/features/program/programsPoolHooks'
import { useProgramWorkspace } from '@/features/program/workspace'

interface ProgramFiltersProps {
  filters: Filters
  onChange: (next: Filters) => void
}

/**
 * 프로그램 목록 복수 필터 바: 상태(다중선택) + 담당 부서(다중선택) + 시작일 범위(부터·까지).
 * 상태는 상위(AcWorkspaceTab)가 소유하며, 본 컴포넌트는 표시·변경만 담당한다.
 */
export function ProgramFilters({ filters, onChange }: ProgramFiltersProps) {
  const config = useProgramWorkspace()
  const active = hasActiveProgramFilters(filters)
  // 상태 선택지는 워크스페이스 수명주기를 그대로 따른다 — 제안 단계를 쓰지 않는 곳에
  // 시도·선정·미선정을 남겨 두면 아무것도 걸리지 않는 필터가 된다.
  const statusOptions = useMemo(
    () =>
      programStatusOptions(config.hasProposalStage).map((value) => ({
        value,
        label: PROGRAM_STATUS_LABEL[value] ?? value,
      })),
    [config.hasProposalStage],
  )
  // 선택지는 오늘의 조직도(활성 버전) 기준이되, 값은 계보 id라 지난 단계에 지정된 사업도 함께 걸린다.
  // 라벨은 전체 경로다 — 체크박스 목록에서 동명의 말단('1팀')을 가리려면 상위가 다 보여야 한다.
  const { options } = useDepartmentOptions()
  const departmentOptions = useMemo(
    () => options.map((o) => ({ value: o.lineage, label: o.label })),
    [options],
  )

  return (
    <div className="flex flex-wrap items-center gap-2">
      <MultiSelectFilter
        label="상태"
        options={statusOptions}
        selected={filters.statuses}
        onChange={(statuses) => onChange({ ...filters, statuses })}
      />

      <MultiSelectFilter
        label="담당 부서"
        options={departmentOptions}
        selected={filters.departmentLineages}
        onChange={(departmentLineages) => onChange({ ...filters, departmentLineages })}
      />

      <DateRangeFilter
        label="시작일"
        from={filters.startFrom}
        to={filters.startTo}
        onChange={({ from, to }) => onChange({ ...filters, startFrom: from, startTo: to })}
      />

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
