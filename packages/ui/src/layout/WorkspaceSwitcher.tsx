import { Fragment, useState } from 'react'
import { Dropdown, DropdownItem } from '../components/Dropdown'

export interface WorkspaceOption {
  key: string
  label: string
  /** 준비 중 등 선택 불가 워크스페이스는 비활성 처리. */
  disabled?: boolean
  /** 워크스페이스가 무엇을 하는지 한 줄로 설명하는 부제(라벨 아래에 회색으로 노출). */
  description?: string
  /** 이 항목부터 시작되는 섹션명. 지정 시 위에 구분선 + 섹션 라벨을 그린다. */
  groupLabel?: string
  /** 섹션 라벨 없이 이 항목 위에 구분선만 그린다(groupLabel과 함께 쓰면 무시). */
  divider?: boolean
}

export interface WorkspaceSwitcherProps {
  /** 노출 대상 워크스페이스(앱 레이어에서 PermissionMap 기준으로 필터링해 전달). */
  options: WorkspaceOption[]
  current: string
  onSelect: (key: string) => void
  /**
   * 배치 맥락. `topbar`는 밝은 상단바용 인라인 텍스트 버튼,
   * `sidebar`는 어두운 사이드바 배경에 놓이는 전체 폭 컨트롤이다.
   */
  variant?: 'topbar' | 'sidebar'
  /** sidebar variant 전용. 사이드바가 접힌 상태에서는 워크스페이스 첫 글자만 노출한다. */
  collapsed?: boolean
}

/**
 * 워크스페이스 전환 드롭다운(순수 UI).
 * 권한 기반 노출 제어는 앱 레이어에서 options를 필터링해 주입한다.
 */
export function WorkspaceSwitcher({
  options,
  current,
  onSelect,
  variant = 'topbar',
  collapsed = false,
}: WorkspaceSwitcherProps) {
  const [open, setOpen] = useState(false)
  const currentLabel =
    options.find((o) => o.key === current)?.label ?? current
  const isSidebar = variant === 'sidebar'

  return (
    <Dropdown
      open={open}
      onClose={() => setOpen(false)}
      align={isSidebar ? 'left' : 'center'}
      placement={isSidebar ? 'right-start' : 'bottom'}
      block={isSidebar}
      // 사이드바 컨테이너의 좌우 패딩(px-2 = 8px)을 상쇄해 바깥 테두리에서 6px 띄운다.
      // (기본 ml-1.5만 쓰면 패널이 사이드바에 걸쳐 보인다.)
      className={isSidebar ? 'ml-3.5' : undefined}
      trigger={
        isSidebar ? (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label="워크스페이스 전환"
            title={collapsed ? currentLabel : undefined}
            className={`flex w-full items-center rounded-radius-md border border-white/20 bg-white/10 text-body font-bold text-white transition-colors duration-fast hover:bg-white/20 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/20 ${
              // 접힘 시 사이드바 메뉴 항목과 동일한 h-10 규격으로 맞춘다.
              collapsed
                ? 'h-10 justify-center px-0'
                : 'justify-between gap-1.5 px-3 py-2'
            }`}
          >
            <span className="min-w-0 truncate">
              {collapsed ? currentLabel.charAt(0) : currentLabel}
            </span>
            {/* 메뉴가 오른쪽 옆으로 펼쳐지므로 화살표도 좌우 방향을 가리킨다(열리면 반대쪽). */}
            {!collapsed && (
              <span
                aria-hidden
                className={`shrink-0 text-caption text-white/70 transition-transform duration-fast ${open ? 'rotate-180' : ''}`}
              >
                ▶
              </span>
            )}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-radius-md px-2 py-1 text-body-lg font-semibold text-gray-900 transition-colors duration-fast hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/10"
          >
            {currentLabel}
            <span
              aria-hidden
              className={`text-caption text-gray-400 transition-transform duration-fast ${open ? 'rotate-180' : ''}`}
            >
              ▼
            </span>
          </button>
        )
      }
    >
      {options.map((opt, idx) => {
        const isCurrent = opt.key === current
        return (
          <Fragment key={opt.key}>
            {/* 구분선은 메뉴 좌우 여백(mx-3)에 맞춰 들여쓰는 드롭다운 관례를 따른다. */}
            {idx > 0 && (opt.groupLabel || opt.divider) && (
              <div className="mx-3 my-1 border-t border-gray-200" />
            )}
            {opt.groupLabel && (
              <div className="px-3 pb-1 pt-1">
                <span className="text-caption font-semibold text-gray-600">
                  {opt.groupLabel}
                </span>
              </div>
            )}
            <DropdownItem
              disabled={opt.disabled}
              onClick={() => {
                onSelect(opt.key)
                setOpen(false)
              }}
            >
              <span className="flex w-full items-baseline gap-3 whitespace-nowrap">
                <span
                  className={`w-28 shrink-0 ${
                    isCurrent ? 'font-semibold text-brand' : 'font-medium text-gray-900'
                  }`}
                >
                  {opt.label}
                </span>
                {opt.description && (
                  <span className="text-caption font-light text-gray-600">{opt.description}</span>
                )}
                {isCurrent && (
                  <span className="ml-auto shrink-0 self-center rounded-radius-sm bg-brand-25 px-1.5 py-0.5 text-caption font-medium text-brand">
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
