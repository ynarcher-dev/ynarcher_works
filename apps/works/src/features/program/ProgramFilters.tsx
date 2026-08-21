import { DateRangeFilter, FilterResetButton, MultiSelectFilter } from '@ynarcher/ui'
import { useMemo } from 'react'
import { useDepartmentOptions } from '@/features/management/departmentOptions'
import { PROGRAM_STATUS_LABEL, programStatusOptions } from '@/features/program/config'
import {
  EMPTY_PROGRAM_FILTERS,
  UNCLASSIFIED_CATEGORY,
  hasActiveProgramFilters,
  type ProgramFilters as Filters,
} from '@/features/program/programsPoolHooks'
import { useProgramWorkspace } from '@/features/program/workspace'

interface ProgramFiltersProps {
  filters: Filters
  onChange: (next: Filters) => void
}

/**
 * 프로그램 목록 복수 필터 바: 상태 + 사업구분 + 담당 부서(모두 다중선택) + 운영기간(시작일~종료일).
 * 필터 값은 상위(ProgramListTab)가 소유하며, 본 컴포넌트는 표시·변경만 담당한다.
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
  // 사업구분 선택지 끝에 '미지정'을 둔다 — 세분화 메뉴를 내린 뒤로 미분류(category is null)
  // 건을 골라 볼 길이 여기뿐이다. 종전에는 사이드바 '기타'가 그 역할을 겸했다.
  const categoryOptions = useMemo(
    () => [
      ...config.categories.map((c) => ({ value: c.value, label: c.label })),
      { value: UNCLASSIFIED_CATEGORY, label: '미지정' },
    ],
    [config.categories],
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

      {/* 분류를 운용하지 않는 워크스페이스에서는 필터 자체를 감춘다(선택지가 '미지정' 하나뿐인
          필터는 걸 이유가 없다). 등록 폼의 사업구분 필드와 같은 판정이다. */}
      {config.categories.length > 0 && (
        <MultiSelectFilter
          label="사업구분"
          options={categoryOptions}
          selected={filters.categories}
          onChange={(categories) => onChange({ ...filters, categories })}
        />
      )}

      <MultiSelectFilter
        label="담당 부서"
        options={departmentOptions}
        selected={filters.departmentLineages}
        onChange={(departmentLineages) => onChange({ ...filters, departmentLineages })}
      />

      {/* 두 칸은 표의 두 열(운영 시작일·운영 종료일)을 그대로 묻는다 — 칸 안에 적힌 이름이
          곧 어느 열을 거르는지의 답이라 별도 라벨을 앞에 두지 않는다. */}
      <DateRangeFilter
        fromLabel="운영 시작일"
        toLabel="운영 종료일"
        from={filters.startFrom}
        to={filters.endTo}
        onChange={({ from, to }) => onChange({ ...filters, startFrom: from, endTo: to })}
      />

      {active && (
        <FilterResetButton onClick={() => onChange(EMPTY_PROGRAM_FILTERS)} />
      )}
    </div>
  )
}
