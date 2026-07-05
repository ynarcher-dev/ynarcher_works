import { useState, type ReactNode } from 'react'
import { Drawer } from '../components/Drawer'
import { Topbar } from './Topbar'

export interface AppShellProps {
  sidebar: ReactNode
  topbarLeft?: ReactNode
  topbarRight?: ReactNode
  children: ReactNode
}

/**
 * 앱 셸: 사이드바 240px + 상단바 56px + 콘텐츠.
 * 1024px(lg) 미만에서는 사이드바를 드로어로 전환한다.
 * 근거: 2_app_layout_navigation.md, 1_ui_ux_mobile.md
 */
export function AppShell({
  sidebar,
  topbarLeft,
  topbarRight,
  children,
}: AppShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* 데스크톱 고정 사이드바 */}
      <div className="hidden lg:block">{sidebar}</div>

      {/* 모바일 드로어 */}
      <Drawer open={mobileOpen} onClose={() => setMobileOpen(false)}>
        {sidebar}
      </Drawer>

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          onMenuClick={() => setMobileOpen(true)}
          left={topbarLeft}
          right={topbarRight}
        />
        <main className="min-w-0 flex-1 p-4 lg:p-6">{children}</main>
      </div>
    </div>
  )
}
