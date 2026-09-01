import { AppShell, SegmentedToggle, Sidebar, SidebarItem } from '@ynarcher/ui'
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import logo from '@/assets/logo.png'
import { GuestUserMenu } from '@/app/GuestUserMenu'
import { useGuestStore } from '@/auth/guestStore'
import {
  EXPERT_NAV,
  defaultView,
  homePathOf,
  moduleNavItems,
  viewOfPath,
  type GuestView,
} from '@/config/navigation'
import { useGuestModules } from '@/features/moduleHooks'

/**
 * GUEST 앱 셸 — WORKS와 **같은 부품**(`AppShell`·`Sidebar`·`SidebarItem`)으로 조립한다.
 *
 * WorksLayout을 복사하지 않는 이유는 슬롯에 들어갈 내용이 하나도 겹치지 않기 때문이다.
 * 워크스페이스 스위처 자리에는 전환 불가능한 사업명이 들어가고(3_9 §2), 상단바의 전역
 * 검색·알림은 게스트에게 존재하지 않는다. 공유해야 하는 것은 조립이 아니라 부품이며,
 * 부품은 이미 `@ynarcher/ui`에 있다.
 *
 * 모바일에서는 `AppShell`이 사이드바를 드로어로 바꾸므로 모바일 우선 원칙과 충돌하지 않는다.
 *
 * 스타트업 뷰의 메뉴 목록은 코드가 아니라 **원장**에서 온다 — WORKS에서 공개로 올린 모듈이
 * 그대로 한 줄씩 선다(3_9_workspace_guest.md §1.1). 그래서 셸이 모듈을 직접 조회한다.
 */
export function GuestLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const user = useGuestStore((s) => s.user)
  const program = useGuestStore((s) => s.program)

  const { data: modules } = useGuestModules()
  const isExpert = user?.role === 'external_expert'
  const view: GuestView =
    viewOfPath(location.pathname) ?? defaultView(user?.role)
  const items = view === 'expert' ? [...EXPERT_NAV] : moduleNavItems(modules ?? [])
  // 공개 메뉴가 하나도 없는 사업이 있을 수 있다. 그때 로고와 뷰 전환은 루트로 보내고,
  // '열린 메뉴가 없다'는 사실은 루트 화면이 말한다.
  const home = (target: GuestView) => homePathOf(target, modules ?? []) ?? '/'

  const sidebar = (
    <Sidebar
      header={
        <div className="flex w-full items-center justify-center">
          <Link to={home(view)} className="min-w-0 shrink">
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
    >
      <div className="flex flex-col gap-1">
        {items.map((item) => {
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

  // 상단바에 메뉴명(topbarLeft)을 세우지 않는다(2026-09-01) — 지금 어디인가는
  // 사이드바의 활성 표시와 본문 머리(메뉴명)가 이미 두 번 답하고 있다.
  return (
    <AppShell
      sidebar={sidebar}
      topbarRight={
        <>
          {/* 겸직 전문가 계정의 역할 전환. 사업 전환이 아니라는 점을 라벨로 못박는다. */}
          {isExpert && (
            <SegmentedToggle
              label="화면 전환"
              value={view}
              onChange={(next) => navigate(home(next as GuestView))}
              options={[
                { key: 'expert', label: '전문가' },
                { key: 'startup', label: '스타트업' },
              ]}
            />
          )}
          {/* 계정 표시·마이페이지·로그아웃 — WORKS와 같은 자리(우측 끝)의 개인 메뉴. */}
          <GuestUserMenu />
        </>
      }
    >
      {/* NOTICE 우측 칸은 셸이 아니라 메뉴 화면(ModulePage)이 가른다 — 머리(이름·안내·
          진행기간)와 그 밑 구분선은 전체 폭으로 서고, 분할은 구분선 아래에서 시작해야 한다. */}
      <Outlet />
    </AppShell>
  )
}
