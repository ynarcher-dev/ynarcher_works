import { Dropdown, Input } from '@ynarcher/ui'
import { useState } from 'react'
import { useTags } from '@/features/admin/hooks'
import {
  EMPTY_STARTUP_FILTERS,
  hasActiveStartupFilters,
  type StartupPoolFilters as Filters,
} from '@/features/startup/startupPoolHooks'

interface StartupPoolFiltersProps {
  filters: Filters
  onChange: (next: Filters) => void
}

/**
 * 태그 원장(*_tags)에서 옵션을 채우는 다중선택 팝오버 하나.
 * 선택값은 태그명 배열이며, 목록에 없는 레거시 선택값도 유실 없이 노출한다.
 */
function MultiTagFilter({
  label,
  table,
  selected,
  onChange,
}: {
  label: string
  table: string
  selected: string[]
  onChange: (next: string[]) => void
}) {
  const [open, setOpen] = useState(false)
  const { data: tags } = useTags(table)
  const options = tags ?? []
  // 태그 원장에 없는 레거시 선택값도 체크 해제할 수 있도록 목록에 합친다.
  const names = [...new Set([...options.map((t) => t.name), ...selected])]

  const toggle = (name: string) =>
    onChange(selected.includes(name) ? selected.filter((n) => n !== name) : [...selected, name])

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
          {label}
          {active && (
            <span className="ml-0.5 inline-flex min-w-5 justify-center rounded-full bg-brand px-1.5 text-caption font-semibold text-white">
              {selected.length}
            </span>
          )}
        </button>
      }
    >
      <div className="max-h-64 min-w-44 overflow-auto">
        {names.length === 0 && (
          <div className="px-3 py-2 text-caption text-gray-500">옵션 없음</div>
        )}
        {names.map((name) => (
          <label
            key={name}
            className="flex cursor-pointer items-center gap-2 rounded-radius-md px-3 py-1.5 text-body text-gray-800 hover:bg-gray-50"
          >
            <input
              type="checkbox"
              checked={selected.includes(name)}
              onChange={() => toggle(name)}
              className="h-4 w-4 accent-brand"
            />
            <span>{name}</span>
          </label>
        ))}
      </div>
    </Dropdown>
  )
}

/**
 * 발굴기업 목록 복수 필터 바: 산업·단계·구분·관리현황(태그 다중선택) + 설립일 범위(From~To).
 * 상태는 상위(StartupPoolTab)가 소유하며, 본 컴포넌트는 표시·변경만 담당한다.
 */
export function StartupPoolFilters({ filters, onChange }: StartupPoolFiltersProps) {
  const active = hasActiveStartupFilters(filters)
  return (
    <div className="flex flex-wrap items-center gap-2">
      <MultiTagFilter
        label="산업"
        table="industry_tags"
        selected={filters.industries}
        onChange={(industries) => onChange({ ...filters, industries })}
      />
      <MultiTagFilter
        label="단계"
        table="investment_stage_tags"
        selected={filters.stages}
        onChange={(stages) => onChange({ ...filters, stages })}
      />
      {/* 구분은 탭(투자/보육/발굴/기타)이 이미 고정하므로 필터에서 제외한다. */}
      <MultiTagFilter
        label="관리현황"
        table="company_status_tags"
        selected={filters.statuses}
        onChange={(statuses) => onChange({ ...filters, statuses })}
      />

      <div className="w-28">
        <Input
          type="number"
          min={0}
          inputMode="numeric"
          placeholder="업력(최소)"
          value={filters.ageMin}
          onChange={(e) => onChange({ ...filters, ageMin: e.target.value })}
        />
      </div>
      <div className="w-28">
        <Input
          type="number"
          min={0}
          inputMode="numeric"
          placeholder="업력(최대)"
          value={filters.ageMax}
          onChange={(e) => onChange({ ...filters, ageMax: e.target.value })}
        />
      </div>

      {active && (
        <button
          type="button"
          onClick={() => onChange(EMPTY_STARTUP_FILTERS)}
          className="flex h-ctl-page items-center rounded-radius-md border border-gray-300 bg-white px-3.5 text-body text-gray-700 shadow-soft transition-colors duration-fast hover:border-gray-400 hover:text-brand-700"
        >
          초기화
        </button>
      )}
    </div>
  )
}
