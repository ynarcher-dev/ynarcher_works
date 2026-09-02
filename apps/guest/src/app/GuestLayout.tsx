import { AppShell, Sidebar, SidebarItem } from '@ynarcher/ui'
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import logo from '@/assets/logo.png'
import { GuestUserMenu } from '@/app/GuestUserMenu'
import { useGuestStore } from '@/auth/guestStore'
import {
  GUEST_HOME_PATH,
  STARTUP_FIXED_NAV,
  moduleNavItems,
  type GuestNavItem,
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
  const program = useGuestStore((s) => s.program)

  const { data: modules } = useGuestModules()
  // 사이드바 하위 메뉴는 원장이 세운다. 뷰 축(스타트업/전문가)은 2026-09-03에 걷혔다 —
  // 전문가 전용 화면이 멘토링·매칭과 함께 사라져 전환할 곳이 없다.
  const items = moduleNavItems(modules ?? [])

  /** 사이드바 한 줄. 고정 메뉴(사업개요)와 원장이 세우는 메뉴가 같은 규격으로 선다. */
  const renderItem = (item: GuestNavItem) => {
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
  }

  const sidebar = (
    <Sidebar
      header={
        <div className="flex w-full items-center justify-center">
          <Link to={GUEST_HOME_PATH} className="min-w-0 shrink">
            <img src={logo} alt="Y&ARCHER" className="h-7 object-contain" />
          </Link>
        </div>
      }
      subheader={
        // WORKS의 워크스페이스 스위처가 서는 자리. 게스트는 사업이 세션에 고정되어 있어
        // 고를 것이 없으므로, 같은 규격의 **읽기 전용 표시**로 지금 어느 사업인지만 답한다.
        // 사업 코드는 세우지 않는다(2026-09-01) — 로그인 열쇠일 뿐, 들어온 뒤에는 답하는
        // 것이 없다.
        program && (
          <div className="rounded-radius-md border border-white/20 bg-white/10 px-3 py-2">
            <p className="truncate text-body font-bold text-white">{program.title}</p>
          </div>
        )
      }
    >
      <div className="flex flex-col gap-1">
        {/* 상단은 고정 메뉴 묶음(사업개요·공지사항·일정안내·QNA — 첫 줄이 로그인 직후
            착지점)이다. 원장이 세우는 하위 메뉴와는 구분선으로 가른다 — 층이 다른 메뉴임을
            선 하나가 답한다. */}
        {STARTUP_FIXED_NAV.map(renderItem)}
        {items.length > 0 && <div aria-hidden className="my-1 border-t border-white/20" />}
        {items.map(renderItem)}
      </div>
    </Sidebar>
  )

  // 상단바에 메뉴명(topbarLeft)을 세우지 않는다(2026-09-01) — 지금 어디인가는
  // 사이드바의 활성 표시와 본문 머리(메뉴명)가 이미 두 번 답하고 있다.
  return (
    <AppShell
      sidebar={sidebar}
      topbarRight={
        /* 계정 표시·마이페이지·로그아웃 — WORKS와 같은 자리(우측 끝)의 개인 메뉴. */
        <GuestUserMenu />
      }
    >
      {/* NOTICE 우측 칸은 셸이 아니라 메뉴 화면(ModulePage)이 가른다 — 머리(이름·안내·
          진행기간)와 그 밑 구분선은 전체 폭으로 서고, 분할은 구분선 아래에서 시작해야 한다. */}
      <Outlet />
    </AppShell>
  )
}
