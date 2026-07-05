import {
  AppShell,
  Avatar,
  Dropdown,
  DropdownItem,
  Sidebar,
  SidebarItem,
  WorkspaceSwitcher,
} from '@ynarcher/ui'
import { useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { hasWorkspaceRead, useAuthStore } from '@/auth/authStore'
import { employeeAuth } from '@/auth/employeeAuthService'
import { WORKSPACES } from '@/config/workspaces'
import { WORKSPACE_SUBNAV, firstTab } from '@/config/navigation'

/**
 * 인증된 WORKS 셸: 상단바 워크스페이스 전환 드롭다운 + 컨텍스트 사이드바 + 프로필 메뉴.
 * 근거: 2_app_layout_navigation.md (§2 상단바 / §3 사이드바)
 */
export function WorksLayout() {
  const user = useAuthStore((s) => s.user)
  const navigate = useNavigate()
  const location = useLocation()
  const [profileOpen, setProfileOpen] = useState(false)

  const visible = WORKSPACES.filter((w) => hasWorkspaceRead(user, w.key))

  // 현재 워크스페이스(경로 기준). 미매칭 시 첫 노출 워크스페이스로 폴백.
  const currentWs =
    visible.find((w) => location.pathname.startsWith(w.path)) ?? visible[0]

  // 현재 워크스페이스의 세부 메뉴 + 활성 섹션(?tab, 없으면 기본 첫 항목).
  const groups = currentWs ? WORKSPACE_SUBNAV[currentWs.key] ?? [] : []
  const activeTab =
    new URLSearchParams(location.search).get('tab') ?? firstTab(groups)

  const switcherOptions = visible.map((w) => ({
    key: w.key,
    label: w.implemented ? w.label : `${w.label} (준비 중)`,
    disabled: !w.implemented,
  }))

  const goToSection = (item: { tab?: string }) => {
    if (!currentWs) return
    navigate(item.tab ? `${currentWs.path}?tab=${item.tab}` : currentWs.path)
  }

  const sidebar = (
    <Sidebar
      header={
        <span className="text-title-sm font-bold text-gray-900">
          와이앤아처 <span className="text-brand">WORKS</span>
        </span>
      }
    >
      {groups.map((g, gi) => (
        <div key={g.group ?? gi} className="pb-1">
          {g.group && (
            <p className="px-3 pb-1 pt-3 text-caption font-semibold uppercase tracking-wide text-gray-400">
              {g.group}
            </p>
          )}
          {g.items.map((item) => (
            <SidebarItem
              key={item.label}
              label={item.label}
              active={item.tab ? item.tab === activeTab : true}
              onClick={() => goToSection(item)}
            />
          ))}
        </div>
      ))}
    </Sidebar>
  )

  return (
    <AppShell
      sidebar={sidebar}
      topbarLeft={
        currentWs && (
          <WorkspaceSwitcher
            options={switcherOptions}
            current={currentWs.key}
            onSelect={(key) => {
              const w = WORKSPACES.find((x) => x.key === key)
              if (w?.implemented) navigate(w.path)
            }}
          />
        )
      }
      topbarRight={
        <Dropdown
          open={profileOpen}
          onClose={() => setProfileOpen(false)}
          align="right"
          trigger={
            <button
              type="button"
              aria-label="계정 메뉴"
              onClick={() => setProfileOpen((v) => !v)}
              className="flex items-center gap-2 rounded p-0.5 hover:bg-gray-100"
            >
              <span className="hidden text-body text-gray-600 sm:inline">
                {user?.name}
              </span>
              <Avatar name={user?.name ?? '?'} size="sm" />
            </button>
          }
        >
          <div className="border-b border-gray-100 px-3 py-2">
            <p className="text-body font-medium text-gray-900">{user?.name}</p>
            <p className="text-caption text-gray-500">
              {user?.email ?? user?.role}
            </p>
          </div>
          <DropdownItem disabled>내 계정 관리</DropdownItem>
          <DropdownItem onClick={() => void employeeAuth.signOut()}>
            로그아웃
          </DropdownItem>
        </Dropdown>
      }
    >
      <Outlet />
    </AppShell>
  )
}
