import { Dropdown, Input } from '@ynarcher/ui'
import { useState } from 'react'
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

/** 상태(대기/진행중/종료/취소) 다중선택 팝오버. 옵션은 고정 목록(PROGRAM_STATUS_OPTIONS). */
function StatusFilter({
  selected,
  onChange,
}: {
  selected: string[]
  onChange: (next: string[]) => void
}) {
  const [open, setOpen] = useState(false)
  const toggle = (value: string) =>
    onChange(
      selected.includes(value)
        ? selected.filter((v) => v !== value)
        : [...selected, value],
    )

  const active = selected.length > 0
  return (
    <Dropdown
      open={open}
      onClose={() => setOpen(false)}
      trigger={
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className={
            'flex h-ctl-page items-center gap-1 rounded-radius-md border px-3.5 text-body shadow-soft transition-colors duration-fast ' +
            (active
              ? 'border-brand/50 bg-brand/5 text-brand-700'
              : 'border-gray-300 bg-white text-gray-400 hover:border-gray-400')
          }
        >
          상태
          {active && (
            <span className="ml-0.5 inline-flex min-w-5 justify-center rounded-full bg-brand px-1.5 text-caption font-semibold text-white">
              {selected.length}
            </span>
          )}
        </button>
      }
    >
      <div className="min-w-40">
        {PROGRAM_STATUS_OPTIONS.map((value) => (
          <label
            key={value}
            className="flex cursor-pointer items-center gap-2 rounded-radius-md px-3 py-1.5 text-body text-gray-800 hover:bg-gray-50"
          >
            <input
              type="checkbox"
              checked={selected.includes(value)}
              onChange={() => toggle(value)}
              className="h-4 w-4 accent-brand"
            />
            <span>{PROGRAM_STATUS_LABEL[value]}</span>
          </label>
        ))}
      </div>
    </Dropdown>
  )
}

/**
 * 프로그램 목록 복수 필터 바: 상태(다중선택) + 시작일 범위(From~To).
 * 상태는 상위(AcWorkspaceTab)가 소유하며, 본 컴포넌트는 표시·변경만 담당한다.
 */
export function ProgramFilters({ filters, onChange }: ProgramFiltersProps) {
  const active = hasActiveProgramFilters(filters)
  return (
    <div className="flex flex-wrap items-center gap-2">
      <StatusFilter
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
