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
 * 앱 셸: 사이드바 240px(접힌 경우 64px) + 콘텐츠.
 * 1024px(lg) 미만에서는 사이드바를 드로어로 전환하고, 드로어를 여는 햄버거를 담기 위해
 * 상단바를 노출한다.
 *
 * 데스크톱에서는 상단바를 렌더하지 않는다 — 로고·워크스페이스 스위처·계정 메뉴·사이드바
 * 접기가 모두 사이드바로 이동해 상단바가 담을 내용이 없어졌고, 빈 띠가 세로 공간만 차지하기
 * 때문이다. 슬롯(topbarLeft/Center/Right) API는 유지하되 lg 이상에서는 표시되지 않는다.
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
          className="lg:hidden"
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
