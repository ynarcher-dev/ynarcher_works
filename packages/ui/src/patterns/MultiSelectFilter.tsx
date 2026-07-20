import { useState } from 'react'
import { Dropdown } from '../components/Dropdown'
import { FilterButton } from './FilterButton'

export interface FilterOption {
  value: string
  label: string
}

export interface MultiSelectFilterProps {
  /** 필터 칩에 표시할 이름(상태·카테고리 등). */
  label: string
  options: FilterOption[]
  selected: string[]
  onChange: (next: string[]) => void
  align?: 'left' | 'right'
}

/**
 * 목록 툴바의 다중선택 필터 팝오버(칩 + 체크박스 목록).
 * 옵션 목록만 갈아끼우면 어떤 원장 목록에서도 동일한 규격으로 쓸 수 있다.
 */
export function MultiSelectFilter({
  label,
  options,
  selected,
  onChange,
  align = 'left',
}: MultiSelectFilterProps) {
  const [open, setOpen] = useState(false)
  const toggle = (value: string) =>
    onChange(
      selected.includes(value)
        ? selected.filter((v) => v !== value)
        : [...selected, value],
    )

  return (
    <Dropdown
      open={open}
      onClose={() => setOpen(false)}
      align={align}
      trigger={
        <FilterButton
          active={selected.length > 0}
          count={selected.length}
          onClick={() => setOpen((o) => !o)}
        >
          {label}
        </FilterButton>
      }
    >
      <div className="min-w-40">
        {options.map((opt) => (
          <label
            key={opt.value}
            className="flex cursor-pointer items-center gap-2 rounded-radius-md px-3 py-1.5 text-body text-gray-800 hover:bg-gray-50"
          >
            <input
              type="checkbox"
              checked={selected.includes(opt.value)}
              onChange={() => toggle(opt.value)}
              className="h-4 w-4 accent-brand"
            />
            <span>{opt.label}</span>
          </label>
        ))}
      </div>
    </Dropdown>
  )
}
