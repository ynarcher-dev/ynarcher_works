import {
  Bell,
  BookOpen,
  CalendarDays,
  CircleHelp,
  type LucideIcon,
} from 'lucide-react'
import { moduleDisplayName } from '@ynarcher/master-data'
import { moduleIcon } from '@/features/moduleMeta'
import type { GuestModule } from '@/features/moduleHooks'

/**
 * 사이드바 메뉴 한 줄. WORKS와 달리 하위 항목·플라이아웃이 없어 경로 하나가 곧 한 줄이다.
 *
 * 2026-09-03 — 뷰 축(스타트업/전문가)을 걷었다. 전문가 뷰의 메뉴는 멘토링 스케줄과 상담
 * 평가지 둘뿐이었는데 그 원장과 화면이 함께 사라졌고, 갈 곳이 없는 뷰를 남기면 전환
 * 스위치가 빈 화면으로 데려간다. 멘토링을 다시 설계하는 날 뷰도 함께 다시 세운다.
 */
export interface GuestNavItem {
  path: string
  label: string
  icon: LucideIcon
}

/**
 * 스타트업 뷰의 메뉴는 **코드에 없다.**
 *
 * WORKS 사업 상세의 '프로그램'에서 담당자가 공유 범위를 WORKS+GUEST 또는 전체공개로 올린
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
 * 스타트업 뷰 사이드바 **상단의 고정 메뉴 묶음**. 첫 줄(사업개요)이 로그인 직후 착지점이다.
 *
 * 모듈 메뉴는 원장이 세우지만(위 moduleNavItems), 이 넷은 메뉴(모듈)가 아니라 사업 자체를
 * 향한 화면이라 코드에 고정으로 선다 — 담당자가 켜고 끄는 대상이 아니고, 공개 메뉴가
 * 하나도 없는 사업이어도 로그인이 열렸다면 소개·공지·문의는 닿을 수 있어야 한다.
 * 일정안내만은 성격이 반쯤 다르다 — 보여 주는 내용 자체가 공개 메뉴들의 기간이라
 * 공개 메뉴가 없으면 빈 화면이 되지만, 자리는 고정으로 지킨다(메뉴가 열리는 날 바로 선다).
 * 원장이 세우는 하위 메뉴와는 사이드바가 구분선으로 가른다(GuestLayout).
 */
export const STARTUP_FIXED_NAV: readonly [GuestNavItem, ...GuestNavItem[]] = [
  { path: '/overview', label: '사업개요', icon: BookOpen },
  { path: '/announcements', label: '공지사항', icon: Bell },
  { path: '/schedule', label: '일정안내', icon: CalendarDays },
  { path: '/qna', label: 'QNA', icon: CircleHelp },
]

/**
 * 로그인 직후·루트 진입의 착지점. 언제나 사업개요다 — 공개 메뉴가 하나도 없어도 사업소개는
 * 읽을 수 있으므로 '갈 곳 없음'이라는 결과가 없다.
 */
export const GUEST_HOME_PATH: string = STARTUP_FIXED_NAV[0].path
