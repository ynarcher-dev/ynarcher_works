import { useState } from 'react'
import { Checkbox } from '../components/Checkbox'
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
      // 팝오버는 absolute라 폭이 트리거 버튼 크기로 수축한다 — min-w-40은 하한만 잡으므로
      // 그보다 긴 선택지(부서 계보처럼 상위까지 붙는 이름)가 두세 줄로 접혔다. 내용 폭
      // (w-max)으로 늘려 한 줄에 담고, 화면을 넘지 않도록 상한만 건다. 상한을 넘는 이름은
      // 그때만 접힌다 — 잘라내면 어느 부서인지 읽을 수 없게 된다.
      className="w-max max-w-[min(32rem,calc(100vw-2rem))]"
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
      {/* 선택지 수는 원장(태그 목록)이 정하므로 화면이 감당할 상한을 여기서 건다 —
          국가처럼 200개가 넘는 축은 팝오버가 화면 아래로 흘러 마지막 항목을 고를 수 없었다.
          약 열 줄까지는 그대로 늘고 그 뒤부터 팝오버 안에서 스크롤한다. */}
      <div className="max-h-80 min-w-40 overflow-y-auto overscroll-contain">
        {options.map((opt) => (
          <Checkbox
            key={opt.value}
            checked={selected.includes(opt.value)}
            onChange={() => toggle(opt.value)}
            label={opt.label}
            // 항목 줄 전체가 누르는 자리라 팝오버 폭을 채우고 호버 면을 갖는다.
            wrapperClassName="flex w-full rounded-radius-md px-3 py-1.5 hover:bg-gray-50"
          />
        ))}
      </div>
    </Dropdown>
  )
}
