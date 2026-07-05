import { useState } from 'react'
import { Dropdown, DropdownItem } from '../components/Dropdown'

export interface WorkspaceOption {
  key: string
  label: string
}

export interface WorkspaceSwitcherProps {
  /** 노출 대상 워크스페이스(앱 레이어에서 PermissionMap 기준으로 필터링해 전달). */
  options: WorkspaceOption[]
  current: string
  onSelect: (key: string) => void
}

/**
 * 워크스페이스 전환 드롭다운(순수 UI).
 * 권한 기반 노출 제어는 앱 레이어에서 options를 필터링해 주입한다.
 */
export function WorkspaceSwitcher({
  options,
  current,
  onSelect,
}: WorkspaceSwitcherProps) {
  const [open, setOpen] = useState(false)
  const currentLabel =
    options.find((o) => o.key === current)?.label ?? current

  return (
    <Dropdown
      open={open}
      onClose={() => setOpen(false)}
      trigger={
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-1 rounded border border-gray-300 bg-white px-3 py-1.5 text-body font-medium text-gray-800 hover:bg-gray-50"
        >
          {currentLabel}
          <span aria-hidden className="text-caption text-gray-400">
            ▼
          </span>
        </button>
      }
    >
      {options.map((opt) => (
        <DropdownItem
          key={opt.key}
          onClick={() => {
            onSelect(opt.key)
            setOpen(false)
          }}
        >
          {opt.label}
        </DropdownItem>
      ))}
    </Dropdown>
  )
}
