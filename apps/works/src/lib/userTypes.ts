/**
 * 계정 유형(`users.user_type`)에서 **내부 임직원과 외부 게스트를 가르는 단일 원천**.
 *
 * 게스트 계정은 별도 원장이 아니라 `public.users`에 같은 모양으로 들어온다(게스트 로그인
 * 개방 시 Edge Function이 삽입한다). 그래서 "임직원 목록"을 묻는 모든 조회는 유형으로
 * 걸러야 하고, 걸러지지 않은 조회는 조용히 게스트를 섞어 답한다 — 실제로 MANAGEMENT
 * 인사 관리·결재선·담당자 선택·멘션이 그렇게 게스트를 보여 주고 있었다(2026-09-03).
 *
 * 목록을 여기 한 벌만 둔다. 같은 세 값을 화면마다 적으면 유형이 하나 늘어나는 날 어느
 * 화면이 빠졌는지 셀 방법이 없다. RLS는 이 경계를 막지 않는다 — 게스트 행도 내부
 * 사용자에게 열려 있어야 참가자 명부가 게스트의 이름을 붙일 수 있기 때문이며, 여기서
 * 거르는 것은 **접근 차단이 아니라 목록의 사실 관계**다(권한 강제는 RLS·RPC가 한다).
 */

/** 외부 게스트 계정 유형 3종. DB `public.user_type` enum과 `app.is_guest_user_type()`의 짝. */
export const GUEST_USER_TYPES = ['external_startup', 'external_expert', 'temporary_guest'] as const

export type GuestUserType = (typeof GUEST_USER_TYPES)[number]

/**
 * PostgREST `.not('user_type', 'in', …)`에 그대로 넣는 값.
 * 괄호까지 포함한 형태여야 필터로 해석된다(`(a,b,c)`).
 */
export const GUEST_USER_TYPE_FILTER = `(${GUEST_USER_TYPES.join(',')})`

/** 이 계정이 외부 게스트인가. 유형을 모르면(null·미상) 게스트로 보지 않는다. */
export function isGuestUserType(userType: string | null | undefined): boolean {
  return GUEST_USER_TYPES.includes(userType as GuestUserType)
}

/** ADMIN 게스트 계정 관리의 유형 표기. 권한 콘솔의 역할 라벨(ROLES)과 같은 말을 쓴다. */
export const GUEST_TYPE_LABEL: Record<GuestUserType, string> = {
  external_startup: '스타트업',
  external_expert: '전문가',
  temporary_guest: '임시 게스트',
}
