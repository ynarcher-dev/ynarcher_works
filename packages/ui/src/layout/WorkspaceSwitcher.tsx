import { Fragment, useState } from 'react'
import { Dropdown, DropdownItem } from '../components/Dropdown'

export interface WorkspaceOption {
  key: string
  label: string
  /** 준비 중 등 선택 불가 워크스페이스는 비활성 처리. */
  disabled?: boolean
  /** 이 항목 위에 구분선을 그린다(예: 시스템 관리 섹션 분리). */
  dividerBefore?: boolean
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
      align="center"
      trigger={
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-radius-md px-2 py-1 text-body-lg font-semibold text-gray-900 transition-colors duration-fast hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-info/10"
        >
          {currentLabel}
          <span
            aria-hidden
            className={`text-caption text-gray-400 transition-transform duration-fast ${open ? 'rotate-180' : ''}`}
          >
            ▼
          </span>
        </button>
      }
    >
      {options.map((opt) => {
        const isCurrent = opt.key === current
        return (
          <Fragment key={opt.key}>
            {opt.dividerBefore && (
              <div className="my-1 border-t border-gray-200" aria-hidden />
            )}
            <DropdownItem
              disabled={opt.disabled}
              onClick={() => {
                onSelect(opt.key)
                setOpen(false)
              }}
            >
              <span className="flex w-full items-center justify-between gap-3">
                <span className={isCurrent ? 'font-semibold text-brand' : undefined}>
                  {opt.label}
                </span>
                {isCurrent && (
                  <span className="rounded-radius-sm bg-brand-25 px-1.5 py-0.5 text-caption font-medium text-brand">
                    현재
                  </span>
                )}
              </span>
            </DropdownItem>
          </Fragment>
        )
      })}
    </Dropdown>
  )
}
