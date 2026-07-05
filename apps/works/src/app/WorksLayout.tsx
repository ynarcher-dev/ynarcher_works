import {
  Award,
  BadgeCheck,
  BriefcaseBusiness,
  CalendarDays,
  ChartNoAxesCombined,
  Download,
  Folder,
  Handshake,
  LayoutGrid,
  Lightbulb,
  Link2,
  LockKeyhole,
  PanelLeftClose,
  PanelLeftOpen,
  ReceiptText,
  Rocket,
  Search,
  Sparkles,
  Target,
  User,
  Users,
  WalletCards,
  Megaphone,
  FolderOpen,
  LayoutDashboard,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
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
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import logo from '@/assets/logo.png'
import { hasWorkspaceRead, useAuthStore } from '@/auth/authStore'
import { employeeAuth } from '@/auth/employeeAuthService'
import { WORKSPACES } from '@/config/workspaces'
import { WORKSPACE_SUBNAV, firstTab } from '@/config/navigation'

const sidebarIconByTab: Record<string, LucideIcon> = {
  // HUB 그룹 1: 메인
  dashboard: LayoutDashboard,
  ai: Sparkles,
  calendar: CalendarDays,
  notices: Megaphone,
  files: FolderOpen,
  insights: Lightbulb,

  // HUB 그룹 2: 마스터 정보
  managers: Users,
  startups: Rocket,
  experts: BriefcaseBusiness,
  partners: Handshake,

  // HUB 그룹 3: 현황 정보
  ac: Target,
  mna: BriefcaseBusiness,
  project: Folder,

  // HUB 그룹 4: 실적 정보
  fund: WalletCards,
  management: ChartNoAxesCombined,

  // 기존 탭 매핑 유지
  search: Search,
  ranking: Award,
  directory: Users,
  merge: Link2,
  growth: ChartNoAxesCombined,
  kanban: BadgeCheck,
  matching: LayoutGrid,
  permissions: LockKeyhole,
  audit: ReceiptText,
  downloads: Download,
  approval: BadgeCheck,
  hr: User,
  finance: WalletCards,
  assets: BriefcaseBusiness,
}

const sidebarIconByWorkspace: Record<string, LucideIcon> = {
  ac: Target,
  fund: WalletCards,
  project: Folder,
}

/**
 * 인증된 WORKS 셸: 상단바 워크스페이스 전환 드롭다운 + 컨텍스트 사이드바 + 프로필 메뉴.
 * 근거: 2_app_layout_navigation.md (§2 상단바 / §3 사이드바)
 */
export function WorksLayout() {
  const user = useAuthStore((s) => s.user)
  const navigate = useNavigate()
  const location = useLocation()
  const [profileOpen, setProfileOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

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

  const getSidebarIcon = (item: { tab?: string }) =>
    item.tab
      ? sidebarIconByTab[item.tab]
      : currentWs
        ? sidebarIconByWorkspace[currentWs.key]
        : undefined

  const sidebar = (
    <Sidebar
      collapsed={sidebarCollapsed}
      header={
        <Link to="/hub" className="flex w-full justify-center">
          <img src={logo} alt="Y&ARCHER" className="h-8 object-contain" />
        </Link>
      }
    >
      {groups.map((g, gi) => (
        <div key={g.group ?? gi} className="pb-3 last:pb-0">
          {gi > 0 && (
            <div className="mx-3 my-2 border-t border-white/10" />
          )}
          <div className="flex flex-col gap-1">
            {g.items.map((item) => {
              const Icon = getSidebarIcon(item)

              return (
                <SidebarItem
                  key={item.label}
                  icon={Icon ? <Icon aria-hidden className="size-4" /> : undefined}
                  label={item.label}
                  active={item.tab ? item.tab === activeTab : true}
                  collapsed={sidebarCollapsed}
                  onClick={() => goToSection(item)}
                />
              )
            })}
          </div>
        </div>
      ))}
    </Sidebar>
  )

  return (
    <AppShell
      sidebarCollapsed={sidebarCollapsed}
      sidebar={sidebar}
      topbarLeft={
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="hidden items-center justify-center rounded-radius-md p-1.5 text-gray-500 transition-colors duration-fast hover:bg-gray-100 hover:text-gray-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-info/10 lg:flex"
            aria-label={sidebarCollapsed ? '사이드바 열기' : '사이드바 접기'}
            title={sidebarCollapsed ? '사이드바 열기' : '사이드바 접기'}
          >
            {sidebarCollapsed ? (
              <PanelLeftOpen aria-hidden className="size-5" strokeWidth={1.8} />
            ) : (
              <PanelLeftClose aria-hidden className="size-5" strokeWidth={1.8} />
            )}
          </button>
        </div>
      }
      topbarCenter={
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
              className="flex items-center gap-2 rounded-radius-md p-0.5 transition-colors duration-fast hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-info/10"
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
