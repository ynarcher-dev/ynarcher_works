import { AppShell, Avatar, Sidebar, SidebarItem } from '@ynarcher/ui'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { hasWorkspaceRead, useAuthStore } from '@/auth/authStore'
import { employeeAuth } from '@/auth/employeeAuthService'
import { WORKSPACES } from '@/config/workspaces'

/** 인증된 WORKS 셸: 권한 기반 사이드바 + 상단바 + 콘텐츠 아웃렛. */
export function WorksLayout() {
  const user = useAuthStore((s) => s.user)
  const navigate = useNavigate()
  const location = useLocation()

  const visible = WORKSPACES.filter((w) => hasWorkspaceRead(user, w.key))

  const sidebar = (
    <Sidebar
      header={
        <span className="text-title-sm font-bold text-gray-900">
          와이앤아처 <span className="text-brand">WORKS</span>
        </span>
      }
    >
      {visible.map((w) => (
        <SidebarItem
          key={w.key}
          label={w.implemented ? w.label : `${w.label} (준비 중)`}
          active={location.pathname.startsWith(w.path)}
          onClick={() => w.implemented && navigate(w.path)}
        />
      ))}
    </Sidebar>
  )

  return (
    <AppShell
      sidebar={sidebar}
      topbarRight={
        <div className="flex items-center gap-3">
          <span className="hidden text-body text-gray-600 sm:inline">
            {user?.name} · {user?.role}
          </span>
          <Avatar name={user?.name ?? '?'} size="sm" />
          <button
            type="button"
            onClick={() => void employeeAuth.signOut()}
            className="rounded border border-gray-300 px-2 py-1 text-caption text-gray-700 hover:bg-gray-50"
          >
            로그아웃
          </button>
        </div>
      }
    >
      <Outlet />
    </AppShell>
  )
}
