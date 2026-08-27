import { CalendarDays, ClipboardList, type LucideIcon } from 'lucide-react'
import { moduleDisplayName } from '@ynarcher/master-data'
import { moduleIcon } from '@/features/moduleMeta'
import type { GuestModule } from '@/features/moduleHooks'

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
 * 스타트업 뷰의 메뉴는 **코드에 없다.**
 *
 * WORKS 사업 상세의 '일정관리'에서 담당자가 공유 범위를 WORKS+GUEST 또는 전체공개로 올린
 * 모듈이 그대로 한 줄씩 선다(2026-08-27 확정). 메뉴를 여기에 박아 두면 담당자가 WORKS에서
 * 메뉴를 켜고 꺼도 게스트 화면은 그대로여서, 운영자가 보는 구성과 참여자가 보는 구성이
 * 갈린다 — 그 어긋남을 없애려면 목록을 코드가 아니라 원장이 들고 있어야 한다.
 * 무엇이 공개인지의 판정은 RLS(`app.guest_module_ids()`)가 하며, 화면은 돌아온 것을 그린다.
 */
export function moduleNavItems(modules: readonly GuestModule[]): GuestNavItem[] {
  return modules.map((mod) => ({
    path: modulePath(mod.id),
    label: moduleDisplayName(mod),
    icon: moduleIcon(mod.module_type),
  }))
}

/** 모듈 화면 경로. 라우터와 사이드바가 같은 규칙을 쓰도록 한곳에서 만든다. */
export function modulePath(moduleId: string): string {
  return `/m/${moduleId}`
}

/**
 * 전문가 뷰의 메뉴는 여전히 고정이다.
 *
 * 전문가에게 보이는 것은 사업이 연 메뉴가 아니라 **본인에게 배정된 일**(스케줄·평가지)이며,
 * 이는 공유 범위 스위치가 아니라 배정 여부가 정한다. 축이 다른 목록을 같은 규칙으로 묶으면
 * 어느 쪽 기준으로 열렸는지 설명할 수 없게 된다.
 */
export const EXPERT_NAV: readonly [GuestNavItem, ...GuestNavItem[]] = [
  { path: '/sessions', label: '멘토링 스케줄', icon: CalendarDays },
  { path: '/feedback', label: '상담 평가지', icon: ClipboardList },
]

/** 로그인 직후 열 기본 뷰. 전문가 계정만 전문가 화면에서 시작한다. */
export function defaultView(role: string | undefined): GuestView {
  return role === 'external_expert' ? 'expert' : 'startup'
}

/**
 * 현재 경로가 속한 뷰. 뷰를 별도 상태로 들지 않고 경로에서 되읽는다 — 상태로 들면 새로고침·
 * 뒤로가기에서 주소와 사이드바가 어긋난다(주소는 전문가 화면인데 메뉴는 스타트업 것).
 */
export function viewOfPath(pathname: string): GuestView | undefined {
  if (EXPERT_NAV.some((item) => item.path === pathname)) return 'expert'
  if (pathname.startsWith('/m/')) return 'startup'
  return undefined
}

/**
 * 그 뷰의 착지점(뷰 전환·루트 진입). 스타트업 뷰는 공개 메뉴가 하나도 없을 수 있으므로
 * `undefined`가 정상 결과다 — 그때는 '열린 메뉴가 없다'는 사실을 화면이 말한다.
 */
export function homePathOf(
  view: GuestView,
  modules: readonly GuestModule[],
): string | undefined {
  if (view === 'expert') return EXPERT_NAV[0].path
  const first = modules[0]
  return first ? modulePath(first.id) : undefined
}
