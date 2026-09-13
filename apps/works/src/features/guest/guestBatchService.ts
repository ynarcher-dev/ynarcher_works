import { supabase } from '@/lib/supabase'
import {
  GUEST_BATCH_MAX_ROWS,
  type GuestBatchField,
  type GuestBatchOutcome,
  type GuestBatchPayloadRow,
  type GuestRowIssue,
} from '@/features/guest/guestBatch'

/**
 * 여러 줄 GUEST 계정 생성의 **서버 어댑터** — 계약이 이 파일 한 장에만 닿는다.
 *
 * 한 줄 생성은 `guestAccountService.createGuestAccount`(`create_guest_account`)가 계속 소유한다.
 * 두 경로를 합치지 않는 것은 **계약이 다르기 때문**이다 — 한 줄 경로는 멱등이라 같은 이메일이면
 * 기존 계정을 돌려주고, 이 경로는 엄격해서 이미 쓰이는 이메일·연락처를 **행 실패**로 돌려준다.
 * 일괄 입력에서 "만들었습니다"가 실은 남의 계정 재사용이면 담당자가 알 방법이 없기 때문이다
 * (`20260913140000_strict_guest_account_batch.sql` 머리말).
 *
 * **서버 계약**(`public.create_guest_accounts(p_rows jsonb)`, SECURITY DEFINER, `authenticated`에만
 * EXECUTE):
 *
 *  · 입력은 `{key, name, email, phone, master_table?, master_id?}` 배열, 한 번에 최대 200건.
 *    비거나 넘치면 행 사유가 아니라 **호출 전체가 거절된다**(22023). 미인증·게스트는 42501.
 *  · 결과는 배열이 아니라 객체다 — `{total, created, failed, rows:[{index, key, status:'CREATED'|
 *    'FAILED', user_id, user_type, master_table, master_id, errors:[{field, code, message}]}]}`.
 *  · 행 단위로 독립이다(부분 성공). 배치 안 중복은 겹친 행을 **전부** 실패로 세운다.
 *
 * 이 어댑터는 한 줄에서 `key`·`status`·`user_id`·`errors`만 꺼낸다. `total`·`created`·`failed`는
 * 세지 않고 버린다 — 화면이 세는 총계는 **표 전체**(보내지 않은 줄 포함)라 서버가 센 수와 다르고,
 * 두 숫자가 같은 배너에 섞이면 어느 쪽이 답인지 알 수 없다(`applyBatchOutcomes`가 센다).
 *
 * **실패 사유 문구는 서버 것을 그대로 옮긴다.** 덮으면 담당자가 무엇을 고쳐야 하는지 알 수 없다.
 * 그럴 수 있는 것은 서버 문구가 **무엇과 겹쳤는지를 말하지 않기** 때문이다 — 원장 연결 실패는
 * '없음'과 '권한 없음'을 같은 `MASTER_FORBIDDEN`으로 접고(그러지 않으면 이메일 하나로 매각 검토
 * 대상을 알 수 있다), 이메일·연락처 중복은 기존 계정의 이름도 소속도 밝히지 않는다. 그 성질이
 * 깨지면 여기가 아니라 **RPC를 고쳐야 한다** — 화면에서 덮는 것은 가림이지 보호가 아니다.
 */

const RPC_NAME = 'create_guest_accounts'

interface RawResult {
  rows?: unknown
}

/** 서버가 주는 날것의 한 줄. 무엇이든 올 수 있다고 보고 읽는다. */
interface RawOutcome {
  key?: unknown
  status?: unknown
  user_id?: unknown
  errors?: unknown
}

interface RawIssue {
  field?: unknown
  code?: unknown
  message?: unknown
}

/** 서버의 칸 이름 → 화면의 칸. 원장은 두 칸으로 오지만 화면에는 연결 칸이 하나다. */
const FIELD_MAP: Record<string, GuestBatchField> = {
  name: 'name',
  email: 'email',
  phone: 'phone',
  master_table: 'ledger',
  master_id: 'ledger',
  // `key`는 우리가 만든 줄 식별자라 담당자가 고칠 수 있는 칸이 아니다 — 줄 사유로 세운다.
  key: 'row',
  row: 'row',
}

function toIssue(raw: RawIssue): GuestRowIssue {
  const code = typeof raw.code === 'string' && raw.code ? raw.code : 'FAILED'
  const field = typeof raw.field === 'string' ? (FIELD_MAP[raw.field] ?? 'row') : 'row'
  return {
    field,
    code,
    message: typeof raw.message === 'string' ? raw.message.trim() : '',
  }
}

function toOutcome(raw: RawOutcome): GuestBatchOutcome | null {
  const rowId = typeof raw.key === 'string' ? raw.key : ''
  // 어느 줄의 답인지 모르는 결과는 버린다. 순서로 맞추면 서버가 줄을 건너뛴 순간 전부 어긋난다.
  if (!rowId) return null
  const issues = Array.isArray(raw.errors)
    ? (raw.errors as RawIssue[]).map(toIssue).filter((i) => i.message)
    : []
  // 'CREATED'라고 분명히 말하지 않으면 실패다 — 모르는 값을 성공으로 읽지 않는다.
  const created = raw.status === 'CREATED'
  return {
    rowId,
    status: created ? 'created' : 'failed',
    // 만들어지지 않은 줄에 계정 id를 달지 않는다. 달아 두면 뒤에 오는 코드가 그 id를
    // '만들어졌다'는 증거로 읽을 자리가 생긴다.
    userId: created && typeof raw.user_id === 'string' ? raw.user_id : null,
    issues,
  }
}

/**
 * 한 묶음을 보낸다. 호출 자체가 실패하면(권한·연결·입력 거절) 던진다 — 그때는 **이 묶음의**
 * 어느 줄도 만들어지지 않았다는 뜻이고, 호출부는 그 줄들을 표에 그대로 두고 다시 시도한다.
 */
export async function createGuestAccountsBatch(
  rows: readonly GuestBatchPayloadRow[],
): Promise<GuestBatchOutcome[]> {
  if (rows.length === 0) return []
  if (rows.length > GUEST_BATCH_MAX_ROWS) {
    // 서버가 거절할 호출을 보내지 않는다 — 거절은 행 사유가 아니라 호출 전체의 실패라
    // 앞선 묶음까지 함께 '실패한 시도'로 보이게 된다.
    throw new Error(`한 번에 보낼 수 있는 줄은 ${GUEST_BATCH_MAX_ROWS}건입니다.`)
  }
  const { data, error } = await supabase.rpc(RPC_NAME, { p_rows: rows })
  if (error) throw error
  const result = (data ?? {}) as RawResult
  if (!Array.isArray(result.rows)) {
    throw new Error('서버 응답을 읽지 못했습니다. 다시 시도하세요.')
  }
  return (result.rows as RawOutcome[])
    .map(toOutcome)
    .filter((o): o is GuestBatchOutcome => o !== null)
}
