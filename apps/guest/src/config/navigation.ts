import { Bell, BookOpen, CircleHelp, type LucideIcon } from 'lucide-react'
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
 * 사이드바 **상단의 고정 메뉴 묶음**. 첫 줄(소개)이 로그인 직후 착지점이다.
 *
 * 모듈 메뉴는 원장이 세우지만(위 moduleNavItems), 이 줄들은 메뉴(모듈)가 아니라 맥락 자체를
 * 향한 화면이라 코드에 고정으로 선다 — 담당자가 켜고 끄는 대상이 아니고, 공개 메뉴가
 * 하나도 없어도 로그인이 열렸다면 소개·공지·문의는 닿을 수 있어야 한다.
 * 원장이 세우는 하위 메뉴와는 사이드바가 구분선으로 가른다(GuestLayout).
 *
 * 2026-09-13 — 사용자 지정으로 **일정안내를 모든 맥락에서 공통 철회했다**(한시적). 지금 세
 * 맥락의 고정 메뉴는 모두 소개·공지사항·Q&A 셋이다.
 */
const PROGRAM_FIXED_NAV: readonly [GuestNavItem, ...GuestNavItem[]] = [
  { path: '/overview', label: '프로젝트 개요', icon: BookOpen },
  { path: '/announcements', label: '공지사항', icon: Bell },
  { path: '/qna', label: 'Q&A', icon: CircleHelp },
]

const MNA_FIXED_NAV: readonly [GuestNavItem, ...GuestNavItem[]] = [
  { path: '/overview', label: 'M&A 프로젝트 개요', icon: BookOpen },
  { path: '/announcements', label: '공지사항', icon: Bell },
  { path: '/qna', label: 'Q&A', icon: CircleHelp },
]

/**
 * 조합(FUND) 맥락의 고정 메뉴. 2026-09-09에 일정안내를 뺀 뒤로 셋이었고, 2026-09-13에
 * 나머지 맥락이 같은 셋이 되면서 이제 차이는 소개 줄의 이름(`조합 개요`)뿐이다.
 */
const FUND_FIXED_NAV: readonly [GuestNavItem, ...GuestNavItem[]] = [
  { path: '/overview', label: '조합 개요', icon: BookOpen },
  { path: '/announcements', label: '공지사항', icon: Bell },
  { path: '/qna', label: 'Q&A', icon: CircleHelp },
]

/**
 * 이 맥락의 고정 메뉴. 값이 없으면 사업으로 읽는다 — 구 세션이 복원되는 8시간 동안
 * `entityKey`가 비어 들어오고, 그때 메뉴가 사라지는 것보다 종전 구성이 서는 편이 낫다.
 */
export function fixedNavOf(
  entityKey: string | null | undefined,
): readonly [GuestNavItem, ...GuestNavItem[]] {
  if (entityKey === 'fund') return FUND_FIXED_NAV
  if (entityKey === 'ma_program') return MNA_FIXED_NAV
  return PROGRAM_FIXED_NAV
}

/**
 * 이 맥락의 소개문을 부르는 이름. **메뉴 이름과 화면 제목이 같은 자리에서 나온다** —
 * 두 곳에 적으면 사이드바는 '조합 개요'인데 본문 머리는 '사업개요'인 화면이 된다.
 */
export function overviewLabelOf(entityKey: string | null | undefined): string {
  return fixedNavOf(entityKey)[0].label
}

/**
 * 로그인 직후·루트 진입의 착지점. 언제나 소개 화면이다 — 공개 메뉴가 하나도 없어도 소개는
 * 읽을 수 있으므로 '갈 곳 없음'이라는 결과가 없다. 경로는 맥락과 무관하게 하나다.
 */
export const GUEST_HOME_PATH: string = PROGRAM_FIXED_NAV[0].path
