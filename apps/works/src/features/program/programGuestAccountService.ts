import { supabase } from '@/lib/supabase'
import type { GuestEntityKey } from '@/features/guest/host'

/**
 * 사업·조합의 GUEST 명부에 **이미 있는 계정을 잇는** 유일한 창구.
 *
 * 서버 계약은 `20260913150000_workspace_guest_roster_add_accounts.sql`이 소유한다 —
 * `add_program_guest_accounts(p_entity_key, p_program_id, p_user_ids)`가 **계정당 한 줄**
 * (`user_id` · `status` · `reason`)을 돌려준다. 이 파일이 하는 일은 그 줄들을 화면이 말할 수
 * 있는 세 수(담김 · 이미 있음 · 실패)로 접는 것뿐이다.
 *
 * **행 단위 결과이지만 부분 성공은 아니다**(서버 주석 그대로). `FAILED`는 그 줄만 건너뛴
 * 것이고, 담당자가 아니거나 원장 키가 짝이 맞지 않는 것은 행의 사유가 아니라 **호출 전체의
 * 예외**다. 그래서 여기서도 전자는 결과로, 후자는 throw로 갈라 내보낸다.
 *
 * **계정을 만들지 않는다.** 생성 창구는 `/guest-accounts` 하나뿐이며(사용자 확정 2026-09-13),
 * 이 파일은 `create_guest_account`·`issue_guest_account` 어느 쪽도 부르지 않는다.
 */

/** 서버 창구 이름. 호출부가 문자열을 손으로 적지 않도록 여기 한 곳에 둔다. */
export const ADD_GUEST_ACCOUNTS_RPC = 'add_program_guest_accounts'

/** 한 번에 담을 수 있는 계정 수(서버가 같은 값으로 막는다). */
export const ADD_GUEST_ACCOUNTS_MAX = 200

export type AddGuestAccountStatus = 'ADDED' | 'ALREADY_PRESENT' | 'FAILED'

export interface AddGuestAccountRow {
  userId: string
  status: AddGuestAccountStatus
  /** 사유 코드. `ADDED`에는 없다. */
  reason: string | null
}

export interface AddGuestAccountsInput {
  entityKey: GuestEntityKey
  programId: string
  /** 이을 계정. **계정 id(user_id)가 키다** — 원장 행 id가 아니다(원장 없는 계정도 이어진다). */
  userIds: string[]
}

export interface AddGuestAccountsOutcome {
  /** 화면이 보낸 건수(중복을 접은 뒤). */
  requested: number
  /** 이번에 명부에 실제로 생긴 줄 수. */
  added: number
  /** 이미 그 사업에 있어 손대지 않은 계정 수. 실패가 아니다. */
  alreadyPresent: number
  /** 담기지 못한 계정. 사유 코드를 그대로 들고 온다. */
  failed: AddGuestAccountRow[]
  /**
   * 서버가 답하지 않은 계정 id.
   *
   * 계약상 계정당 한 줄이 오지만, 오지 않은 줄을 성공으로 세지 않는다 — 보낸 수에서 받은
   * 수를 빼 성공으로 채우면 화면이 없는 사실을 단언한다.
   */
  unanswered: string[]
}

/** 사유 코드를 담당자의 말로 옮긴다. 모르는 코드는 코드 그대로 보여 준다(삼키지 않는다). */
export function describeAddReason(reason: string | null): string {
  switch (reason) {
    case 'ACCOUNT_NOT_AVAILABLE':
      // 서버가 다섯 갈래(없음·삭제·정지·게스트 아님·안 보임)를 한 사유로 묶어 답한다 —
      // 갈라 답하면 id 하나로 숨은 계정의 상태를 되짚을 수 있기 때문이다. 화면도 묶어 적는다.
      return '지금 담을 수 없는 계정입니다(정지·삭제되었거나 접근 권한이 없습니다).'
    case 'DUPLICATE_IN_REQUEST':
      return '같은 요청에 두 번 실렸습니다.'
    case null:
      return '담기지 못했습니다.'
    default:
      return reason
  }
}

/** PostgREST가 "그런 함수가 없다"고 답할 때의 코드. 창구 미배포와 인가 거절은 다른 사실이다. */
const RPC_MISSING = 'PGRST202'

/**
 * 호출 전체의 실패를 담당자의 말로 옮긴다.
 *
 * 창구 미배포를 따로 가르는 이유는 그때 담당자가 할 일이 **아무것도 없기** 때문이다 —
 * 권한 문제로 읽고 관리자에게 문의하거나 다시 눌러 보는 것은 전부 헛수고다.
 */
export function describeAddError(error: { code?: string; message?: string } | null): string {
  if (!error) return 'GUEST 계정을 명부에 추가하지 못했습니다.'
  if (error.code === RPC_MISSING) {
    return `서버에 GUEST 계정 추가 창구(${ADD_GUEST_ACCOUNTS_RPC})가 아직 배포되지 않았습니다.`
  }
  if (error.code === '42501') return '이 프로젝트/FUND의 GUEST 명부를 고칠 권한이 없습니다.'
  return error.message?.trim() || 'GUEST 계정을 명부에 추가하지 못했습니다.'
}

/** 서버가 아는 세 상태만 상태로 받는다 — 모르는 값을 성공으로 읽지 않는다. */
function asStatus(value: unknown): AddGuestAccountStatus | null {
  return value === 'ADDED' || value === 'ALREADY_PRESENT' || value === 'FAILED' ? value : null
}

/**
 * 응답 행들을 화면이 말할 수 있는 수로 접는다.
 *
 * 모르는 상태·모르는 id로 온 줄은 **실패로 센다.** 버리면 보낸 수와 받은 수가 어긋난 채로
 * 화면이 "전부 담겼다"고 말하게 된다.
 */
export function summarizeAddResult(
  requestedIds: readonly string[],
  data: unknown,
): Omit<AddGuestAccountsOutcome, 'requested'> {
  const rows = Array.isArray(data) ? (data as Record<string, unknown>[]) : []
  const answered = new Set<string>()
  let added = 0
  let alreadyPresent = 0
  const failed: AddGuestAccountRow[] = []

  for (const raw of rows) {
    const userId = typeof raw.user_id === 'string' ? raw.user_id : null
    if (!userId || !requestedIds.includes(userId)) continue
    answered.add(userId)
    const status = asStatus(raw.status)
    const reason = typeof raw.reason === 'string' ? raw.reason : null
    if (status === 'ADDED') added += 1
    else if (status === 'ALREADY_PRESENT') alreadyPresent += 1
    else failed.push({ userId, status: 'FAILED', reason })
  }

  return {
    added,
    alreadyPresent,
    failed,
    unanswered: requestedIds.filter((id) => !answered.has(id)),
  }
}

/**
 * 고른 계정을 이 사업·조합의 GUEST 명부에 잇는다.
 *
 * 통합 원장이라 `entity_key`를 함께 보낸다 — 사업 id만으로는 소속이 정해지지 않는다.
 * 빈 목록은 서버까지 가지 않는다(왕복도, 감사 로그 한 줄도 남길 이유가 없다).
 */
export async function addProgramGuestAccounts(
  input: AddGuestAccountsInput,
): Promise<AddGuestAccountsOutcome> {
  const userIds = [...new Set(input.userIds)]
  if (userIds.length === 0) {
    return { requested: 0, added: 0, alreadyPresent: 0, failed: [], unanswered: [] }
  }
  if (userIds.length > ADD_GUEST_ACCOUNTS_MAX) {
    // 서버도 같은 수로 막지만, 여기서 먼저 답해야 담당자가 200건을 보내고 전부 잃지 않는다.
    throw new Error(`한 번에 담을 수 있는 계정은 최대 ${ADD_GUEST_ACCOUNTS_MAX}건입니다.`)
  }

  const { data, error } = await supabase.rpc(ADD_GUEST_ACCOUNTS_RPC, {
    p_entity_key: input.entityKey,
    p_program_id: input.programId,
    p_user_ids: userIds,
  })
  if (error) throw new Error(describeAddError(error))

  return { requested: userIds.length, ...summarizeAddResult(userIds, data) }
}
