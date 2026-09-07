import { Fragment, useState } from 'react'
import { Dropdown, DropdownItem } from '../components/Dropdown'

export interface WorkspaceOption {
  key: string
  label: string
  /** 준비 중 등 선택 불가 워크스페이스는 비활성 처리. */
  disabled?: boolean
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
              // 접힘 시 사이드바 메뉴 항목과 같은 규격으로 맞춘다. 그 값은 페이지 맥락의
              // 컨트롤 높이(40px)와 같은 자리이므로 원시 h-10이 아니라 토큰으로 적는다.
              collapsed
                ? 'h-ctl-page justify-center px-0'
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
      {/* 구분선·섹션 라벨은 2026-09-07에 걷었다(사용자 지정). 항목이 일곱이고 이름이
          저마다 다른 자리를 가리키므로, 선이 묶어 주지 않아도 목록이 읽힌다 — 선은 묶음이
          있을 때만 뜻이 서고, 없을 때는 한 목록을 여러 층으로 보이게 만든다. */}
      {options.map((opt) => {
        const isCurrent = opt.key === current
        return (
          <Fragment key={opt.key}>
            <DropdownItem
              disabled={opt.disabled}
              onClick={() => {
                onSelect(opt.key)
                setOpen(false)
              }}
            >
              <span className="flex w-full items-baseline gap-3 whitespace-nowrap">
                {/* 부제(설명)는 2026-09-07에 걷었다. 워크스페이스 이름이 약어에서 부르는
                    이름으로 바뀌면서(Accelerator·Investment Office·Management Office) 이름
                    자체가 그 자리가 무엇인지 답하게 되어, 옆에 붙은 한 줄이 같은 말을 한국어로
                    한 번 더 적는 층이 되었다. 라벨의 고정 폭(w-28)도 함께 걷는다 — 그 폭은
                    설명을 세로로 맞추기 위한 것이었고, 설명이 없는 지금은 긴 이름을 잘라
                    놓기만 한다. */}
                <span
                  className={isCurrent ? 'font-semibold text-brand' : 'font-medium text-gray-900'}
                >
                  {opt.label}
                </span>
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
