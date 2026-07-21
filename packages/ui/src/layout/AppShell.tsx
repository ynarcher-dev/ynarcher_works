import { useState, type ReactNode } from 'react'
import { Drawer } from '../components/Drawer'
import { Topbar } from './Topbar'
import { cn } from '../utils/cn'

export interface AppShellProps {
  sidebar: ReactNode
  topbarLeft?: ReactNode
  topbarCenter?: ReactNode
  topbarRight?: ReactNode
  children: ReactNode
  sidebarCollapsed?: boolean
}

/**
 * 앱 셸: 사이드바 240px(접힌 경우 64px) + 상단바 + 콘텐츠.
 * 1024px(lg) 미만에서는 사이드바를 드로어로 전환하고, 상단바 좌측에 드로어를 여는 햄버거를 둔다.
 *
 * 상단바는 슬롯(topbarLeft/Center/Right)이 하나라도 채워지면 데스크톱에서도 노출한다.
 * 워크스페이스 전환·계정 메뉴는 사이드바가 담당하므로, 상단바는 그와 겹치지 않는
 * 전역 기능(사이드바 접기·현재 위치 표시·통합 검색·알림·바로가기)만 싣는다.
 * 근거: 2_app_layout_navigation.md, 1_ui_ux_mobile.md
 */
export function AppShell({
  sidebar,
  topbarLeft,
  topbarCenter,
  topbarRight,
  children,
  sidebarCollapsed = false,
}: AppShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const hasTopbarContent = Boolean(topbarLeft || topbarCenter || topbarRight)

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* 데스크톱 고정 사이드바.
          sticky + h-screen 으로 뷰포트에 붙여 두어, 본문이 길어져도 사이드바 전체(로고·워크스페이스
          스위처·계정 메뉴)가 항상 같은 자리에 보이게 한다. 메뉴 목록이 넘칠 때는 페이지가 아니라
          Sidebar 내부 스크롤 영역이 스크롤된다. */}
      <div
        className={cn(
          'hidden shrink-0 self-start lg:block',
          // overflow는 잠그지 않는다 — 워크스페이스 스위처 드롭다운이 사이드바 폭 밖으로 펼쳐진다.
          // z-sidebar(300)는 필수다. sticky는 그 자체로 스태킹 컨텍스트를 만들기 때문에, 명시적
          // z-index가 없으면 사이드바 안의 드롭다운(z-dropdown=100)이 본문·상단바에 가려진다.
          // 근거: 8_z_index_system_rules.md (sidebar 300 > navbar 200 > dropdown 100)
          'sticky top-0 z-sidebar h-screen',
          'transition-all duration-300 ease-in-out',
          sidebarCollapsed ? 'w-16' : 'w-60',
        )}
      >
        {sidebar}
      </div>

      {/* 모바일 드로어 */}
      <Drawer open={mobileOpen} onClose={() => setMobileOpen(false)}>
        {sidebar}
      </Drawer>

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          // 슬롯이 모두 비어 있으면 데스크톱에서 빈 띠가 되므로, 그때만 모바일 전용으로 되돌린다
          // (햄버거는 모바일에서만 필요하다).
          className={hasTopbarContent ? undefined : 'lg:hidden'}
          onMenuClick={() => setMobileOpen(true)}
          left={topbarLeft}
          center={topbarCenter}
          right={topbarRight}
        />
        <main className="min-w-0 flex-1 p-4 lg:p-6">{children}</main>
      </div>
    </div>
  )
}
