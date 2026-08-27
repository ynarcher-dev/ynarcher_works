import { CalendarClock, CalendarDays, ClipboardList, Star } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

/**
 * 게스트가 보고 있는 화면 묶음. **역할 전환이지 사업 전환이 아니다** — 사업은 로그인에 쓴
 * 고정코드로 세션에 박히며 전환 스위치를 제공하지 않는다(3_9_workspace_guest.md §2).
 * 전문가 계정이 겸직으로 스타트업 화면을 볼 때만 이 축이 움직인다.
 */
export type GuestView = 'startup' | 'expert'

/** 사이드바 메뉴 한 줄. WORKS와 달리 하위 항목·플라이아웃이 없어 경로 하나가 곧 한 줄이다. */
export interface GuestNavItem {
  path: string
  label: string
  icon: LucideIcon
}

/**
 * 역할별 메뉴. 화면 구성의 근거는 3_9_workspace_guest.md §1.1(스타트업)·§1.2(전문가)이며,
 * 아직 만들지 않은 화면은 자리만 잡아 두지 않는다 — 눌러서 빈 화면이 나오는 메뉴는
 * 없는 메뉴보다 나쁘다.
 *
 * 타입이 **비어 있지 않은 목록**인 것은 의도다. `homePathOf()`가 첫 항목을 착지점으로 쓰므로,
 * 메뉴를 전부 지운 뷰가 생기면 착지할 곳이 없어진다 — 그 사실을 런타임이 아니라 타입이 막는다.
 */
export const GUEST_NAV: Record<GuestView, readonly [GuestNavItem, ...GuestNavItem[]]> = {
  startup: [
    { path: '/schedule', label: '보육 일정', icon: CalendarDays },
    { path: '/booking', label: '멘토링 예약', icon: CalendarClock },
    { path: '/satisfaction', label: '멘토 만족도', icon: Star },
  ],
  expert: [
    { path: '/sessions', label: '멘토링 스케줄', icon: CalendarDays },
    { path: '/feedback', label: '상담 평가지', icon: ClipboardList },
  ],
}

/** 로그인 직후 열 기본 뷰. 전문가 계정만 전문가 화면에서 시작한다. */
export function defaultView(role: string | undefined): GuestView {
  return role === 'external_expert' ? 'expert' : 'startup'
}

/**
 * 현재 경로가 속한 뷰. 뷰를 별도 상태로 들지 않고 경로에서 되읽는다 — 상태로 들면 새로고침·
 * 뒤로가기에서 주소와 사이드바가 어긋난다(주소는 전문가 화면인데 메뉴는 스타트업 것).
 */
export function viewOfPath(pathname: string): GuestView | undefined {
  const views: GuestView[] = ['startup', 'expert']
  return views.find((v) => GUEST_NAV[v].some((item) => item.path === pathname))
}

/** 그 뷰의 첫 메뉴 경로(뷰 전환·루트 진입의 착지점). */
export function homePathOf(view: GuestView): string {
  return GUEST_NAV[view][0].path
}

/** 현재 경로의 메뉴 항목(상단바의 현재 위치 표시용). */
export function navItemOfPath(pathname: string): GuestNavItem | undefined {
  return Object.values(GUEST_NAV)
    .flat()
    .find((item) => item.path === pathname)
}
