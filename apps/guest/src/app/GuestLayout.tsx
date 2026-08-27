import { AppShell, SegmentedToggle, Sidebar, SidebarItem } from '@ynarcher/ui'
import { LogOut } from 'lucide-react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import logo from '@/assets/logo.png'
import { guestAuth } from '@/auth/guestAuthService'
import { useGuestStore } from '@/auth/guestStore'
import {
  GUEST_NAV,
  defaultView,
  homePathOf,
  navItemOfPath,
  viewOfPath,
  type GuestView,
} from '@/config/navigation'

/**
 * GUEST 앱 셸 — WORKS와 **같은 부품**(`AppShell`·`Sidebar`·`SidebarItem`)으로 조립한다.
 *
 * WorksLayout을 복사하지 않는 이유는 슬롯에 들어갈 내용이 하나도 겹치지 않기 때문이다.
 * 워크스페이스 스위처 자리에는 전환 불가능한 사업명이 들어가고(3_9 §2), 상단바의 전역
 * 검색·알림은 게스트에게 존재하지 않는다. 공유해야 하는 것은 조립이 아니라 부품이며,
 * 부품은 이미 `@ynarcher/ui`에 있다.
 *
 * 모바일에서는 `AppShell`이 사이드바를 드로어로 바꾸므로 모바일 우선 원칙과 충돌하지 않는다.
 */
export function GuestLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const user = useGuestStore((s) => s.user)
  const program = useGuestStore((s) => s.program)

  const isExpert = user?.role === 'external_expert'
  const view: GuestView =
    viewOfPath(location.pathname) ?? defaultView(user?.role)
  const current = navItemOfPath(location.pathname)

  const sidebar = (
    <Sidebar
      header={
        <div className="flex w-full items-center justify-center">
          <Link to={homePathOf(view)} className="min-w-0 shrink">
            <img src={logo} alt="Y&ARCHER" className="h-7 object-contain" />
          </Link>
        </div>
      }
      subheader={
        // WORKS의 워크스페이스 스위처가 서는 자리. 게스트는 사업이 세션에 고정되어 있어
        // 고를 것이 없으므로, 같은 규격의 **읽기 전용 표시**로 지금 어느 사업인지만 답한다.
        program && (
          <div className="rounded-radius-md border border-white/20 bg-white/10 px-3 py-2">
            <p className="truncate text-body font-bold text-white">{program.title}</p>
            {program.code && (
              <p className="truncate text-caption text-white/70">{program.code}</p>
            )}
          </div>
        )
      }
      footer={
        // 로그아웃은 밝은 표면용 `Button`을 어두운 배경에 맞게 다시 칠하지 않고, 사이드바가
        // 이미 가진 항목 규격(`SidebarItem`)을 그대로 쓴다 — 같은 면 위의 컨트롤이 두 가지
        // 색 규칙 위에 서면 어느 쪽이 이 사이드바의 규격인지 알 수 없게 된다.
        <div className="space-y-1">
          {user && (
            <p className="truncate px-3.5 text-caption text-white/70">{user.name}님</p>
          )}
          <SidebarItem
            icon={<LogOut aria-hidden className="size-4" />}
            label="로그아웃"
            className="min-h-12"
            onClick={() => guestAuth.signOut()}
          />
        </div>
      }
    >
      <div className="flex flex-col gap-1">
        {GUEST_NAV[view].map((item) => {
          const Icon = item.icon
          return (
            <SidebarItem
              key={item.path}
              icon={<Icon aria-hidden className="size-4" />}
              label={item.label}
              active={item.path === location.pathname}
              // 밀도 격자(page 40px) 위에 GUEST 터치 하한(48px)을 얹는다. 근거: 3_9 §3
              className="min-h-12"
              onClick={() => navigate(item.path)}
            />
          )
        })}
      </div>
    </Sidebar>
  )

  return (
    <AppShell
      sidebar={sidebar}
      topbarLeft={
        current && (
          <span className="truncate text-body-lg font-semibold text-gray-900">
            {current.label}
          </span>
        )
      }
      topbarRight={
        // 겸직 전문가 계정의 역할 전환. 사업 전환이 아니라는 점을 라벨로 못박는다.
        isExpert && (
          <SegmentedToggle
            label="화면 전환"
            value={view}
            onChange={(next) => navigate(homePathOf(next as GuestView))}
            options={[
              { key: 'expert', label: '전문가' },
              { key: 'startup', label: '스타트업' },
            ]}
          />
        )
      }
    >
      <Outlet />
    </AppShell>
  )
}
