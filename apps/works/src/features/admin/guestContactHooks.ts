import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/**
 * ADMIN 전용 GUEST 연락처 수정·비밀번호 초기화 데이터 계층.
 *
 * 조회와 정지·삭제는 `guestAccountHooks.ts`가 소유하고, **계정의 자격증명을 건드리는 두
 * 창구**만 여기에 둔다. 가르는 축은 권한이 아니라 파급이다 — 이 둘은 이미 발급된 세션을
 * 죽이고(`session_version + 1`) 로그인 아이디·초기 비밀번호를 바꾸므로, 실수로 목록 조작에
 * 섞여 들어가서는 안 된다.
 *
 * **권한의 정본은 서버다.** 두 RPC 모두 첫 줄에서 `app.is_admin()`을 재검증하므로 화면의
 * `canAdminister`는 버튼을 세울지 말지만 정한다(화면에서 가리는 것은 인가가 아니다).
 *
 * 근거: supabase/migrations/20260913130000_admin_guest_contact_and_password_reset.sql,
 *       docs/docs_planning/3_9_1_guest_unified_account.md §6.2
 */

/**
 * 비밀번호 초기화 확인 문구(사용자 확정, 2026-09-13).
 *
 * 화면에 흩어 적지 않고 한 곳에서 소유한다 — 초기화가 무엇을 하는지("전화번호가 초기
 * 비밀번호가 된다")를 말하는 문장이고, 그 사실이 바뀌면 고칠 자리가 하나여야 한다.
 */
export const GUEST_PASSWORD_RESET_CONFIRM =
  '비밀번호를 초기화하시겠습니까? 초기화되면 현재 전화번호(숫자만)가 초기 비밀번호가 됩니다.'

/** 연락처에서 숫자만 남긴다 — 서버 `app.norm_phone`과 같은 규칙이다. */
export function guestPhoneDigits(value: string | null | undefined): string {
  return (value ?? '').replace(/\D/g, '')
}

/** 이메일 정규화 — 서버 `app.norm_email`과 같은 규칙이다(소문자 + 양끝 공백 제거). */
export function guestNormalizedEmail(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase()
}

/**
 * 이메일 형식. 서버 `admin_update_guest_contact`의 정규식과 같은 모양을 쓴다 — 여기서 더
 * 느슨하면 담당자가 통과한 값이 서버에서 막히고, 더 엄하면 서버가 받는 값을 화면이 거절한다.
 */
const EMAIL_RE = /^[^@\s]+@[^@\s.]+(\.[^@\s.]+)+$/

/** 전화 자릿수 하한·상한. 02-123-4567 = 9자리, 국가번호 포함 최대 15자리(E.164). */
const PHONE_MIN_DIGITS = 9
const PHONE_MAX_DIGITS = 15

/** 칸별 검증 실패 문구. 비어 있으면 보낼 수 있다. */
export interface GuestContactErrors {
  email?: string
  phone?: string
  reason?: string
}

/**
 * 연락처 수정 입력 검증.
 *
 * **두 칸 모두 값을 요구한다.** "빈 값 = 유지"로 두면 연락처를 지우려는 요청과 구분할 수
 * 없고, 계정은 두 값이 모두 있어야 개시할 수 있기 때문이다(서버와 같은 요구).
 */
export function validateGuestContact(input: {
  email: string
  phone: string
  reason: string
}): GuestContactErrors {
  const errors: GuestContactErrors = {}
  const email = guestNormalizedEmail(input.email)
  const digits = guestPhoneDigits(input.phone)

  if (!email) errors.email = '이메일(로그인 ID)을 입력하세요.'
  else if (email.length > 254 || !EMAIL_RE.test(email))
    errors.email = '이메일 형식이 올바르지 않습니다.'

  if (!digits) errors.phone = '연락처를 입력하세요.'
  else if (digits.length < PHONE_MIN_DIGITS || digits.length > PHONE_MAX_DIGITS)
    errors.phone = `연락처는 숫자 ${PHONE_MIN_DIGITS}~${PHONE_MAX_DIGITS}자리여야 합니다.`

  if (!input.reason.trim()) errors.reason = '수정 사유를 입력하세요(감사 로그에 남습니다).'

  return errors
}

/** 검증 결과에 막힌 칸이 하나라도 있는가. */
export function hasGuestContactError(errors: GuestContactErrors): boolean {
  return Boolean(errors.email || errors.phone || errors.reason)
}

/**
 * 이 계정을 초기화할 수 있는가. 막혔으면 **무엇을 먼저 해야 하는지**를 답한다.
 *
 * 서버도 같은 이유로 거절하지만(연락처가 없으면 초기화가 로그인할 수 없는 계정을 만든다),
 * 누르고 나서 실패를 보는 것과 누르기 전에 아는 것은 다르다. 화면은 서버를 대신하지 않고
 * 같은 결론을 먼저 말한다.
 */
export function guestResetBlockReason(account: { phone: string | null } | null): string | null {
  if (!account) return null
  const digits = guestPhoneDigits(account.phone)
  if (digits.length < PHONE_MIN_DIGITS)
    return '연락처가 없어 초기화할 수 없습니다. 먼저 연락처를 수정하십시오.'
  return null
}

/**
 * 서버가 보낸 실패 문구를 그대로 세운다.
 *
 * 두 RPC는 막힌 이유를 한국어 예외 문구로 답한다(중복 이메일의 소유자 이름, 형식 오류,
 * GUEST가 아닌 계정 등). 화면이 자기 문구로 덮으면 담당자가 무엇을 고쳐야 하는지 잃는다.
 */
export function guestAdminErrorMessage(error: unknown, fallback: string): string {
  const message = (error as { message?: string } | null)?.message
  return message && message.trim() ? message : fallback
}

/** 상세 푸터에 선 ADMIN 창구 둘의 상태. */
export interface GuestAdminActionState {
  /** 두 버튼이 화면에 서는가. */
  visible: boolean
  canEditContact: boolean
  canResetPassword: boolean
  /** 초기화가 막힌 이유(막히지 않았으면 null). */
  resetBlocked: string | null
}

/**
 * 두 창구가 이 계정에 설 수 있는가를 한곳에서 판정한다.
 *
 * 판정을 모아 두는 이유는 셋이 **함께** 걸리기 때문이다 — 권한, 진행 중인 요청, 그리고
 * 연락처 유무. 화면에서 세 조건을 버튼마다 따로 적으면 한 곳을 고칠 때 다른 곳이 남는다.
 *
 * `resetBlocked`를 **권한이 있을 때만** 계산하는 것은 연락처가 ADMIN에게만 원본으로
 * 오기 때문이다. 마스킹된 값(`010-****-5678`)으로 자릿수를 세면 연락처가 멀쩡한 계정을
 * "연락처가 없다"고 답한다.
 *
 * 권한의 정본은 여전히 서버다 — 이 함수는 버튼을 세울지 말지만 정한다.
 */
export function guestAdminActionState(input: {
  canAdminister: boolean
  account: { phone: string | null } | null
  /** 두 창구 중 하나라도 도는 중인가. 도는 동안에는 둘 다 누르지 못한다. */
  pending: boolean
}): GuestAdminActionState {
  const visible = input.canAdminister && Boolean(input.account)
  const resetBlocked = visible ? guestResetBlockReason(input.account) : null
  return {
    visible,
    canEditContact: visible && !input.pending,
    canResetPassword: visible && !input.pending && !resetBlocked,
    resetBlocked,
  }
}

/** `admin_update_guest_contact`의 응답. 표기만 다른 재전송은 `changed: false`로 온다. */
export interface GuestContactUpdateResult {
  user_id: string
  changed: boolean
  email_changed: boolean
  phone_changed: boolean
  session_version: number
  /**
   * 서버가 **실제로 저장한** 두 값. 아무것도 쓰지 않았으면(`changed: false`) null이다.
   *
   * 서버는 바뀐 값을 되돌려주지 않으므로 여기서 채운다. 추측이 아니라 계약이다 —
   * `update … set email = v_email, phone = v_phone`이고 `v_email`·`v_phone`은 우리가 보낸
   * 값을 `btrim`한 것이므로, 성공 응답이 온 시점에 저장된 값은 우리가 보낸 값 그대로다.
   * 두 칸을 함께 담는 이유도 같다 — 한쪽만 달라져도 서버는 두 칸을 모두 다시 쓴다.
   */
  applied: { email: string; phone: string } | null
}

/** `admin_reset_guest_password`의 응답. 비밀번호 값은 한 칸도 오지 않는다. */
export interface GuestPasswordResetResult {
  user_id: string
  had_password: boolean
  session_version: number
  sessions_invalidated: boolean
}

/**
 * 지금 그릴 상세 하나를 고른다 — **목록이 답한 값이 사본을 이긴다.**
 *
 * 사본을 버리지 않는 이유는 목록에서 사라진 계정까지 창을 닫히게 하지 않기 위해서다. 대신
 * 사라진 뒤에도 옛 값이 남지 않도록, 아래 두 `apply*`가 성공한 변경을 사본에 함께 적는다.
 */
export function resolveGuestDetail<T extends { user_id: string }>(
  snapshot: T | null,
  rows: readonly T[],
): T | null {
  if (!snapshot) return null
  return rows.find((row) => row.user_id === snapshot.user_id) ?? snapshot
}

/**
 * 성공한 연락처 수정을 사본에 적는다.
 *
 * **이것이 없으면 목록 검색이 옛 이메일에 걸려 있던 경우 상세가 영구히 옛 값으로 남는다** —
 * 이메일을 고치면 새로 돌아온 목록에 그 계정이 없고(검색어와 더는 맞지 않는다), 사본은 누른
 * 순간의 값이라 화면은 수정이 되지 않은 것처럼 답한다.
 *
 * 적는 값은 **서버가 확인해 준 것뿐이다.** 실패(예외)는 여기 오지 않고, 아무것도 쓰지 않은
 * 재전송(`changed: false`)은 사본을 그대로 돌려준다 — 저장되지 않은 입력을 화면에 세우면
 * 화면이 DB보다 앞서 나간다.
 */
export function applyGuestContactUpdate<
  T extends { user_id: string; email: string | null; phone: string | null },
>(snapshot: T | null, result: GuestContactUpdateResult): T | null {
  if (!snapshot || snapshot.user_id !== result.user_id) return snapshot
  if (!result.changed || !result.applied) return snapshot
  return { ...snapshot, email: result.applied.email, phone: result.applied.phone }
}

/**
 * 성공한 비밀번호 초기화를 사본에 적는다.
 *
 * 목록에서 이미 사라진 계정(앞선 이메일 수정 등)을 초기화하면, 사본만 남은 상세가 계속
 * "본인 설정 완료"로 답하기 때문이다. 초기화가 통했다면 그 계정은 개시 상태다.
 */
export function applyGuestPasswordReset<T extends { user_id: string; has_password: boolean }>(
  snapshot: T | null,
  result: GuestPasswordResetResult,
): T | null {
  if (!snapshot || snapshot.user_id !== result.user_id) return snapshot
  if (!snapshot.has_password) return snapshot
  return { ...snapshot, has_password: false }
}

/**
 * 두 창구가 함께 무효화할 조회 키 — 목록과 명부의 사람 고르기가 같은 연락처를 세운다.
 *
 * **약속을 돌려준다.** `onSuccess`가 이 약속을 반환하면 목록이 새로 돌아올 때까지 mutation이
 * 계속 `isPending`이다. 기다리지 않으면 성공과 새 목록 사이에 창이 하나 열려, 그 사이에는
 * 아직 옛 행이 목록에 남아 있어(사본을 이긴다) 방금 고친 값이 옛 값으로 한 번 깜빡인다.
 */
function invalidateGuestQueries(qc: ReturnType<typeof useQueryClient>) {
  return Promise.all([
    qc.invalidateQueries({ queryKey: ['admin', 'guest-accounts'] }),
    qc.invalidateQueries({ queryKey: ['admin', 'guest-ledger-accounts'] }),
  ])
}

/**
 * 로그인 아이디(이메일)·연락처 수정.
 *
 * 원장(스타트업·네트워크·M&A)은 건드리지 않는다 — 계정의 로그인 자격은 `users`가 갖고,
 * 원장 연락처는 그 원장의 창구가 따로 고친다.
 */
export function useUpdateGuestContact() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: {
      userId: string
      email: string
      phone: string
      reason: string
    }): Promise<GuestContactUpdateResult> => {
      // 보낼 값을 먼저 정해 두고 그 값으로 `applied`를 채운다 — 여기서 한 번 다듬은 것과
      // 나중에 다시 다듬은 것이 어긋나면 사본이 DB와 다른 값을 갖는다.
      const email = v.email.trim()
      const phone = v.phone.trim()
      const { data, error } = await supabase.rpc('admin_update_guest_contact', {
        p_user_id: v.userId,
        p_email: email,
        p_phone: phone,
        p_reason: v.reason.trim(),
      })
      if (error) throw error
      const result = data as Omit<GuestContactUpdateResult, 'applied'>
      return { ...result, applied: result.changed ? { email, phone } : null }
    },
    onSuccess: () => invalidateGuestQueries(qc),
  })
}

/**
 * 비밀번호 초기화 — 계정을 개시 상태로 되돌린다.
 *
 * 그 뒤의 로그인은 현재 연락처로 들어와 **개인 비밀번호를 정한 뒤에야** 세션을 받는다.
 * 안내를 보내지 않고 비밀번호를 화면에 세우지도 않는다 — 자격증명은 오프라인으로 전한다
 * (3_9_1 §6).
 */
export function useResetGuestPassword() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: {
      userId: string
      reason: string
    }): Promise<GuestPasswordResetResult> => {
      const { data, error } = await supabase.rpc('admin_reset_guest_password', {
        p_user_id: v.userId,
        p_reason: v.reason.trim(),
      })
      if (error) throw error
      return data as GuestPasswordResetResult
    },
    onSuccess: () => invalidateGuestQueries(qc),
  })
}
