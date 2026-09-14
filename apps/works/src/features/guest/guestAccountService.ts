import { supabase } from '@/lib/supabase'

/**
 * GUEST 계정 생성의 단일 프론트엔드 진입점.
 *
 * 통합 GUEST 원장에서 만드는 계정은 모두 같은 RPC를 지난다. 원장 찾기는 입력을 돕는 기능일
 * 뿐이며, 이 경로는 원장 식별자를 저장하거나 관계를 만들지 않는다.
 */

/**
 * 최초 비밀번호(2026-09-14 사용자 확정). 계정마다 다르지 않은 **고정 문자열**이다.
 *
 * 값을 여기 한 곳에서만 적는다 — 생성 화면의 안내와 ADMIN 초기화 문구가 각자 문자열을 박아
 * 두면 값이 바뀌는 날 한쪽이 옛 값으로 남아, 담당자가 알려 준 비밀번호로 게스트가 들어오지
 * 못한다. 계정 생성이 이 값의 출처이므로 생성 경로가 소유하고 ADMIN 창구가 가져다 쓴다.
 */
export const GUEST_INITIAL_PASSWORD = 'ynarcher'
export interface CreateGuestAccountInput {
  name: string
  email: string
  /** 소속(필수). `users.affiliation`에 저장하는 문자열이며 원장 FK가 아니다. */
  affiliation: string
}

/**
 * 계정 한 건을 만든다. 계약은 이름·이메일·소속 세 값뿐이다. 연락처와 원장 식별자는 인자에도
 * 요청에도 없으므로 원장에서 값을 골랐더라도 계정에는 세 문자열만 저장된다.
 */
export async function createGuestAccount(input: CreateGuestAccountInput): Promise<string> {
  const { data, error } = await supabase.rpc('create_guest_account', {
    p_name: input.name.trim(),
    p_email: input.email.trim(),
    p_affiliation: input.affiliation.trim(),
  })
  if (error) throw error
  return data as string
}
