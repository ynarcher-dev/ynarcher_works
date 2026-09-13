import type { MasterTable } from '@/features/program/participantPersona'

/**
 * GUEST 계정 여러 줄 생성의 **판정 층** — 파일·화면·서버 응답을 한 벌의 규칙으로 다룬다.
 *
 * 화면(GuestAccountCreateModal)과 어댑터(guestBatchService)는 이 파일의 함수만 부른다. 여기에
 * 조회도 렌더도 두지 않는 이유는 **파일만 있으면 답이 나오는 판정**이기 때문이다 — 순수 함수라
 * 테스트가 지킬 수 있고, 같은 규칙이 미리보기 표와 내려받기 파일에 동시에 걸린다.
 *
 * 이 층이 소유하는 판정은 넷이다.
 *
 *  · **칸 검증** — 이름·이메일·연락처가 서버와 같은 잣대를 통과하는가.
 *  · **목록 안 중복** — 이메일(소문자·앞뒤 공백 제거)과 연락처(숫자만)가 겹치는 줄. 겹친 줄은
 *    **전부** 실패로 세운다. 먼저 적은 줄을 살리면 두 줄 중 어느 쪽이 맞는지 아무도 확인하지
 *    않은 채 한쪽이 계정이 되고, 그 계정의 연락처가 곧 초기 비밀번호라 잘못 고른 대가가 크다.
 *  · **제출 결과 반영** — 성공한 줄은 표에서 빠지고 실패한 줄은 사유를 달고 남는다. 성공을 다시
 *    보내지 않는 것이 요점이다(재제출은 남은 줄만 간다).
 *  · **파일 안팎의 값 다루기** — 읽을 때는 제어문자를 걷고, 내보낼 때는 표 도구가 수식으로
 *    읽을 값을 막는다(`readCell`·`csvCell`).
 *
 * **이미 있는 계정과의 중복은 여기서 판정하지 않는다.** 그것은 서버가 답한다 — 화면에서 미리
 * 훑으면 읽을 권한이 없는 원장(M&A)의 존재가 화면에 드러난다.
 *
 * 검증 규칙과 사유 코드는 `public.create_guest_accounts`(20260913140000)의 것을 그대로 쓴다.
 * 화면이 제 나름의 잣대를 세우면 같은 값이 여기서는 통과하고 서버에서 막히는 왕복이 생기고,
 * 코드가 갈리면 같은 사유가 화면 검증과 서버 응답에서 두 줄로 선다.
 */

/**
 * 계정 한 줄의 어느 칸이 문제인가. `row`는 칸을 특정할 수 없는 사유다.
 *
 * 서버는 원장 연결을 `master_table`·`master_id` 두 칸으로 나눠 답하지만 화면에는 연결 칸이
 * 하나뿐이라 `ledger` 하나로 받는다(어댑터가 옮긴다).
 */
export type GuestBatchField = 'name' | 'email' | 'phone' | 'ledger' | 'row'

/** 한 줄에 달리는 사유 하나. 화면 검증과 서버 응답이 같은 모양을 쓴다. */
export interface GuestRowIssue {
  field: GuestBatchField
  code: string
  message: string
}

/** 화면이 들고 있는 입력 한 줄. */
export interface GuestDraftRow {
  /** 이 줄의 식별자. 서버 요청·응답을 줄에 되돌리는 열쇠다(순서에 기대지 않는다). */
  rowId: string
  name: string
  email: string
  phone: string
  /** 원장 연결(선택). 고르지 않으면 계정만 만든다. */
  masterTable: MasterTable | null
  masterId: string | null
  /** 화면에 보일 원장 대상 이름. 서버로 보내지 않는다. */
  masterName: string | null
  /** 직전 제출에서 서버가 이 줄에 돌려준 사유. 다시 제출할 때까지 남는다. */
  serverIssues: GuestRowIssue[]
}

/** 서버로 보내는 한 줄(`create_guest_accounts`의 입력 모양 그대로). */
export interface GuestBatchPayloadRow {
  /** 결과를 이 줄로 되돌리는 열쇠. 서버는 받은 값을 그대로 돌려준다. */
  key: string
  name: string
  email: string
  phone: string
  master_table: MasterTable | null
  master_id: string | null
}

/** 서버가 줄마다 돌려주는 결과(어댑터가 정규화한 뒤의 모양). */
export interface GuestBatchOutcome {
  rowId: string
  status: 'created' | 'failed'
  userId: string | null
  issues: GuestRowIssue[]
}

/**
 * 한 번에 보낼 수 있는 줄 수. 값의 주인은 `create_guest_accounts`의 `v_max`이며, 넘기면 행
 * 사유가 아니라 **호출 전체가 거절된다**(22023). 그래서 화면이 미리 잘라 보낸다.
 *
 * **파일 상한(`GUEST_SHEET_MAX_ROWS`)과 다른 축이다.** 이쪽은 한 호출의 크기라 잘라 보내면
 * 되지만, 저쪽은 한 번에 검증해야 하는 목록의 크기라 나눌 수 없다(목록 안 중복은 전체를
 * 함께 봐야 답이 나온다).
 */
export const GUEST_BATCH_MAX_ROWS = 200

export interface GuestBatchSummary {
  /** 표에 있던 전체 줄 수(화면 검증에서 걸린 줄까지 센다). */
  total: number
  /** 서버가 만들었다고 **분명히 답한** 줄. */
  created: number
  /** 만들어지지 않은 것이 확실한 줄(서버 사유 + 보내지 못한 줄). */
  failed: number
  /**
   * 만들어졌는지 **알 수 없는** 줄 — 요청은 나갔는데 답을 받지 못했다.
   *
   * 실패로 세지 않는 이유는 실패가 아닐 수 있기 때문이다. 서버는 커밋했는데 응답만 잃은
   * 경우가 있고, 그때 "실패했으니 다시 보내라"고 안내하면 같은 사람의 계정을 두 번 만들려
   * 시도하게 된다(엄격 경로라 두 번째는 거절되지만, 담당자는 무엇이 진짜인지 모른 채로 남는다).
   */
  unknown: number
}

/** 파일 열 이름 → 우리 칸. 키는 공백 제거·소문자 비교값이다. */
const HEADER_ALIASES: Record<string, 'name' | 'email' | 'phone'> = {
  이름: 'name', 성명: 'name', name: 'name',
  이메일: 'email', 이메일주소: 'email', 전자메일주소: 'email', 메일: 'email', 메일주소: 'email',
  email: 'email', 'e-mail': 'email', emailaddress: 'email',
  연락처: 'phone', 휴대폰: 'phone', 휴대전화: 'phone', 핸드폰: 'phone', 전화: 'phone',
  전화번호: 'phone', phone: 'phone', mobile: 'phone',
}

const FIELD_LABEL: Record<'name' | 'email' | 'phone', string> = {
  name: '이름',
  email: '이메일',
  phone: '연락처',
}

/** 템플릿 헤더 — 내려받은 파일을 손대지 않고 그대로 올릴 수 있어야 한다. */
export const GUEST_BATCH_HEADERS = ['이름', '이메일', '연락처'] as const

/**
 * 이메일 형식 — `create_guest_accounts`(20260913140000)가 쓰는 식을 그대로 옮긴 것(POSIX
 * 클래스만 바꿨다). 그 식은 `admin_update_guest_contact`와 같은 값이다 — 같은 계정 원장의
 * 같은 칸이므로 창구마다 다른 기준을 두지 않는다.
 */
const EMAIL_SHAPE = /^[^@\s]+@[^@\s.]+(\.[^@\s.]+)+$/

/** 서버가 재는 상한·범위. 어긋나면 화면과 서버의 판정이 갈린다. */
const NAME_MAX = 100
const EMAIL_MAX = 254
const PHONE_DIGITS_MIN = 9
const PHONE_DIGITS_MAX = 15

/** 줄 식별자 발행기. 화면 안에서만 유효하면 되므로 세션 안 일련번호로 충분하다. */
let rowSeq = 0

export function nextGuestRowId(): string {
  rowSeq += 1
  return `row-${rowSeq}`
}

export function createGuestDraftRow(seed: Partial<Omit<GuestDraftRow, 'rowId'>> = {}): GuestDraftRow {
  return {
    rowId: nextGuestRowId(),
    name: seed.name ?? '',
    email: seed.email ?? '',
    phone: seed.phone ?? '',
    masterTable: seed.masterTable ?? null,
    masterId: seed.masterId ?? null,
    masterName: seed.masterName ?? null,
    serverIssues: seed.serverIssues ?? [],
  }
}

/** 비교용 이메일 — 앞뒤 공백을 걷고 소문자로 눕힌다. 로그인 ID가 될 값이라 표기 차이를 지운다. */
export function normalizeGuestEmail(value: string): string {
  return value.trim().toLowerCase()
}

/** 비교용 연락처 — 숫자만 남긴다. `010-1111-2222`와 `01011112222`는 같은 번호다. */
export function guestPhoneDigits(value: string): string {
  return value.replace(/\D/g, '')
}

function normalizeHeader(raw: string): string {
  return raw.replace(/\s/g, '').toLowerCase()
}

/** C0 제어문자의 끝(0x1F)과 C1 영역(0x7F~0x9F). 표 한 칸 안에 들어갈 값이 아니다. */
const C0_END = 0x1f
const C1_START = 0x7f
const C1_END = 0x9f

/**
 * 제어문자를 공백으로 바꾼다. 정규식 문자군 대신 코드포인트로 재는 것은 소스에 보이지 않는
 * 글자를 박아 두지 않기 위해서다 — 그런 문자군은 편집기에서 범위가 눈에 보이지 않아, 다음에
 * 고치는 사람이 무엇을 지우는 규칙인지 읽을 수 없다.
 *
 * 지우지 않고 공백으로 바꾸는 이유는 `홍<TAB>길동`이 `홍길동`으로 붙어 버리면 안 되기 때문이다.
 */
function stripControlChars(value: string): string {
  let out = ''
  for (const ch of value) {
    const code = ch.codePointAt(0) ?? 0
    out += code <= C0_END || (code >= C1_START && code <= C1_END) ? ' ' : ch
  }
  return out
}

/** 수식으로 해석되는 첫 글자. 엑셀·구글시트·Numbers가 모두 이 넷을 수식 시작으로 읽는다. */
const FORMULA_LEAD = /^[=+\-@]/

/** 표 도구가 값이 아닌 것으로 읽을 값인가 — 수식으로 시작하거나 0으로 시작하는 숫자열. */
function needsCsvGuard(value: string): boolean {
  return FORMULA_LEAD.test(value) || /^0\d+$/.test(value)
}

/**
 * 파일에서 읽은 칸 하나를 다듬는다 — 제어문자를 걷고, 우리가 내보내며 붙였을 수 있는 방어용
 * 홑따옴표를 뗀다.
 *
 * 떼는 조건을 **붙이는 조건과 똑같이** 좁힌다(수식 글자로 시작하거나 0으로 시작하는 숫자열).
 * 조건 없이 떼면 `'철수` 같은 정상 값의 첫 글자를 말없이 지운다 — 내보내기가 만든 표기를
 * 되돌리는 것이 목적이지, 홑따옴표를 일반적으로 금지하는 것이 아니다.
 */
function readCell(raw: string): string {
  const cleaned = stripControlChars(raw).trim()
  if (!cleaned.startsWith("'")) return cleaned
  const body = cleaned.slice(1)
  return needsCsvGuard(body) ? body.trim() : cleaned
}

export interface GuestGridParse {
  rows: GuestDraftRow[]
  /** 파일 전체에 대한 사유(헤더 누락 등). 비어 있으면 형식은 통과다. */
  fileIssues: string[]
  /** 세 칸이 모두 비어 건너뛴 줄 수. 엑셀 파일 꼬리의 빈 줄이 여기로 빠진다. */
  skipped: number
}

/**
 * 표(첫 줄이 헤더인 문자열 격자) → 입력 줄들.
 *
 * CSV와 XLSX가 같은 함수를 지나는 것이 요점이다 — 형식별로 매핑을 따로 두면 같은 파일을
 * 확장자만 바꿔 올렸을 때 열이 다르게 잡힌다. 파일을 격자로 만드는 일은 `guestBatchFile`이 한다.
 *
 * **값을 검증하지 않는다.** 여기서 하는 일은 열을 우리 칸에 맞추고 칸을 다듬는 것뿐이고, 틀린
 * 값은 표에 그대로 실려 화면에서 붉게 선다 — 파일을 다시 만들지 않고 그 자리에서 고칠 수 있어야
 * 한다.
 */
export function parseGuestGrid(grid: readonly (readonly string[])[]): GuestGridParse {
  const header = grid[0]
  if (!header || header.length === 0) {
    return { rows: [], fileIssues: ['파일에서 읽을 내용이 없습니다.'], skipped: 0 }
  }

  const fieldAt = header.map((h) => HEADER_ALIASES[normalizeHeader(h)] ?? null)
  const missing = (['name', 'email', 'phone'] as const).filter((f) => !fieldAt.includes(f))
  if (missing.length > 0) {
    return {
      rows: [],
      fileIssues: [
        `헤더에 ${missing.map((f) => FIELD_LABEL[f]).join('·')} 열이 필요합니다. 템플릿을 내려받아 쓰세요.`,
      ],
      skipped: 0,
    }
  }

  const rows: GuestDraftRow[] = []
  let skipped = 0
  for (const cells of grid.slice(1)) {
    const cellOf = (field: 'name' | 'email' | 'phone') => {
      const idx = fieldAt.indexOf(field)
      return readCell(idx >= 0 ? (cells[idx] ?? '') : '')
    }
    const name = cellOf('name')
    const email = cellOf('email')
    const phone = cellOf('phone')
    if (!name && !email && !phone) {
      skipped += 1
      continue
    }
    rows.push(createGuestDraftRow({ name, email, phone }))
  }
  return { rows, fileIssues: [], skipped }
}

function pushIssue(map: Map<string, GuestRowIssue[]>, rowId: string, issue: GuestRowIssue): void {
  const arr = map.get(rowId)
  if (arr) arr.push(issue)
  else map.set(rowId, [issue])
}

/**
 * 목록 안에서 같은 값을 쓴 줄들을 **모두** 실패로 세운다.
 *
 * 먼저 적은 줄을 살리지 않는 이유는, 같은 이메일이 두 줄인 파일에서 어느 줄이 맞는지 파일만
 * 보고는 알 수 없기 때문이다. 한쪽을 임의로 살리면 나머지 칸(이름·연락처)이 다른 사람 것일 수
 * 있고, 연락처는 그대로 초기 비밀번호가 된다.
 *
 * **목록 전체를 한 번에 본다.** 묶어 보내기(`chunkGuestRows`)는 이 판정이 끝난 뒤의 일이라,
 * 1번 줄과 250번 줄이 겹쳐도 둘 다 걸린다 — 묶음마다 따로 보면 그 둘은 서로를 보지 못한다.
 *
 * **사유에 적는 상대 줄 번호는 몇 개로 묶는다.** 전부 적으면 겹친 줄 수의 제곱만큼 일이
 * 늘어난다 — 같은 이메일 1만 줄짜리 파일 하나가 1억 번의 번호 복사와 1만 개의 초장문 문구가
 * 되어 화면이 멈춘다. 몇 줄과 겹쳤는지는 **총 수**가 답하고, 어디를 볼지는 **앞의 몇 줄**이
 * 답한다. 겹친 줄이 전부 실패한다는 결론은 그대로다.
 */
const COLLISION_PEERS = 3

function markCollisions(
  rows: readonly GuestDraftRow[],
  field: 'email' | 'phone',
  keyOf: (row: GuestDraftRow) => string,
  label: string,
  into: Map<string, GuestRowIssue[]>,
): void {
  const seats = new Map<string, number[]>()
  rows.forEach((row, i) => {
    const key = keyOf(row)
    if (!key) return
    const arr = seats.get(key)
    if (arr) arr.push(i)
    else seats.set(key, [i])
  })
  for (const idxs of seats.values()) {
    if (idxs.length < 2) continue
    // 자기 자신이 섞여 있어도 표본이 남도록 하나 더 떠 둔다(줄마다 최대 하나가 빠진다).
    const head = idxs.slice(0, COLLISION_PEERS + 1)
    const others = idxs.length - 1
    for (const i of idxs) {
      const peers = head.filter((j) => j !== i).slice(0, COLLISION_PEERS)
      const shown = peers.map((j) => j + 1).join('·')
      const rest = others - peers.length
      pushIssue(into, rows[i]!.rowId, {
        field,
        code: field === 'email' ? 'EMAIL_DUPLICATE_IN_BATCH' : 'PHONE_DUPLICATE_IN_BATCH',
        // 어느 줄과 겹치는지 밝힌다 — 서버는 "입력 안에 두 번 이상 있습니다"까지만 알고
        // 화면은 몇 번째 줄인지까지 안다. 그래야 무엇을 지울지가 정해진다.
        message:
          rest > 0
            ? `같은 ${label}을(를) ${shown}번째 줄 외 ${rest.toLocaleString('ko-KR')}줄에 더 적었습니다. 겹친 줄은 모두 만들지 않습니다.`
            : `같은 ${label}을(를) ${shown}번째 줄에도 적었습니다. 겹친 줄은 모두 만들지 않습니다.`,
      })
    }
  }
}

/**
 * 화면 검증 — 서버가 재는 것과 **같은 잣대**로 칸을 보고, 목록 안 중복을 함께 본다.
 *
 * 이미 있는 계정과의 중복은 여기서 보지 않는다(서버가 답한다). 여기서 미리 재는 이유는 왕복을
 * 줄이기 위해서일 뿐이고, 판정의 주인은 계속 서버다 — 그래서 잣대를 흉내 내지 않고 그대로
 * 옮긴다(코드도 같은 값을 쓴다).
 */
export function validateGuestRows(rows: readonly GuestDraftRow[]): Map<string, GuestRowIssue[]> {
  const out = new Map<string, GuestRowIssue[]>()
  for (const row of rows) {
    const name = row.name.trim()
    if (!name) {
      pushIssue(out, row.rowId, {
        field: 'name',
        code: 'NAME_REQUIRED',
        message: '이름을 입력해야 합니다.',
      })
    } else if (name.length > NAME_MAX) {
      pushIssue(out, row.rowId, {
        field: 'name',
        code: 'NAME_TOO_LONG',
        message: `이름은 ${NAME_MAX}자를 넘을 수 없습니다.`,
      })
    }
    const email = row.email.trim()
    if (!email) {
      pushIssue(out, row.rowId, {
        field: 'email',
        code: 'EMAIL_REQUIRED',
        message: '이메일을 입력해야 합니다(이메일이 로그인 ID입니다).',
      })
    } else if (email.length > EMAIL_MAX || !EMAIL_SHAPE.test(normalizeGuestEmail(email))) {
      pushIssue(out, row.rowId, {
        field: 'email',
        code: 'EMAIL_INVALID',
        message: '이메일 형식이 올바르지 않습니다.',
      })
    }
    const digits = guestPhoneDigits(row.phone)
    if (!row.phone.trim()) {
      pushIssue(out, row.rowId, {
        field: 'phone',
        code: 'PHONE_REQUIRED',
        message: '연락처를 입력해야 합니다(연락처가 초기 비밀번호입니다).',
      })
    } else if (digits.length < PHONE_DIGITS_MIN || digits.length > PHONE_DIGITS_MAX) {
      pushIssue(out, row.rowId, {
        field: 'phone',
        code: 'PHONE_INVALID',
        message: `연락처는 숫자 ${PHONE_DIGITS_MIN}~${PHONE_DIGITS_MAX}자리여야 합니다.`,
      })
    }
    if (Boolean(row.masterId) !== Boolean(row.masterTable)) {
      pushIssue(out, row.rowId, {
        field: 'ledger',
        code: 'MASTER_PAIR_REQUIRED',
        message: '원장 연결이 온전하지 않습니다. 연결을 해제하고 다시 고르세요.',
      })
    }
  }
  markCollisions(rows, 'email', (r) => normalizeGuestEmail(r.email), '이메일', out)
  markCollisions(rows, 'phone', (r) => guestPhoneDigits(r.phone), '연락처', out)
  return out
}

/** 화면 검증 + 직전 제출의 서버 사유. 표시와 내려받기가 같은 표를 본다. */
export function guestRowIssues(rows: readonly GuestDraftRow[]): Map<string, GuestRowIssue[]> {
  const out = validateGuestRows(rows)
  for (const row of rows) {
    for (const issue of row.serverIssues) {
      const arr = out.get(row.rowId) ?? []
      // 같은 칸·같은 코드가 두 번 서지 않게 한다(화면 검증과 서버가 같은 결론을 낼 수 있다).
      if (arr.some((i) => i.field === issue.field && i.code === issue.code)) continue
      pushIssue(out, row.rowId, issue)
    }
  }
  return out
}

/** 지금 보낼 수 있는 줄 — 화면 검증을 통과한 줄만. 서버 사유가 남아 있어도 다시 보낸다(재시도). */
export function submittableGuestRows(rows: readonly GuestDraftRow[]): GuestDraftRow[] {
  const issues = validateGuestRows(rows)
  return rows.filter((row) => !issues.has(row.rowId))
}

/**
 * 서버로 보낼 모양으로 접는다. **적힌 그대로 보낸다**(앞뒤 공백만 걷는다) — 이메일 소문자화도
 * 연락처 숫자 추리기도 하지 않는다. 저장 형태와 비교 규칙은 서버가 가진 값이고(`app.norm_email`·
 * `app.norm_phone`), 화면이 앞질러 바꾸면 한 줄 생성 경로와 저장값이 갈린다.
 */
export function toGuestBatchPayload(rows: readonly GuestDraftRow[]): GuestBatchPayloadRow[] {
  return rows.map((row) => ({
    key: row.rowId,
    name: row.name.trim(),
    email: row.email.trim(),
    phone: row.phone.trim(),
    master_table: row.masterTable,
    master_id: row.masterId,
  }))
}

/**
 * 한 번에 보낼 수 있는 크기로 자른다. 서버는 넘치면 호출 전체를 거절한다.
 *
 * **검증이 끝난 뒤에 자른다**(호출부 규약). 자르고 나서 검증하면 묶음 경계를 사이에 둔 중복이
 * 서로를 보지 못한 채 둘 다 만들어진다.
 */
export function chunkGuestRows(
  rows: readonly GuestDraftRow[],
  size = GUEST_BATCH_MAX_ROWS,
): GuestDraftRow[][] {
  const out: GuestDraftRow[][] = []
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size))
  return out
}

/** 서버가 그 줄의 결과를 돌려주지 않았다. **성공으로 읽지 않는다** — 침묵은 답이 아니다. */
const NO_ANSWER: GuestRowIssue = {
  field: 'row',
  code: 'NO_ANSWER',
  message: '서버가 이 줄의 결과를 돌려주지 않았습니다. 다시 시도하세요.',
}

/** 실패라고만 하고 사유를 주지 않은 줄. */
const UNKNOWN_FAILURE: GuestRowIssue = {
  field: 'row',
  code: 'FAILED',
  message: '계정을 만들지 못했습니다. 값과 권한을 확인하세요.',
}

/**
 * 요청은 나갔는데 답을 받지 못한 줄 — **만들어졌을 수도 있다.**
 *
 * 실패와 가르는 이유는 다음 행동이 다르기 때문이다. 실패는 값을 고쳐 다시 보내면 되지만,
 * 이쪽은 **먼저 계정 목록에서 확인해야** 한다. 이미 만들어졌는데 다시 보내면 엄격 경로가
 * 중복으로 거절하고, 담당자는 그 거절을 새로운 문제로 읽는다.
 */
export const RESULT_UNKNOWN: GuestRowIssue = {
  field: 'row',
  code: 'RESULT_UNKNOWN',
  message:
    '결과 확인 필요 — 요청은 갔으나 응답을 받지 못했습니다. 계정 목록에서 이 이메일을 찾아보고, 없을 때만 다시 보내세요.',
}

/**
 * 제출 결과를 표에 반영한다.
 *
 * **성공한 줄은 표에서 빠지고 실패한 줄만 사유를 달고 남는다.** 그래야 고쳐서 다시 누를 때
 * 이미 만들어진 계정이 두 번 가지 않는다. 보내지 않은 줄(화면 검증에 걸린 줄)은 그대로 남되
 * 직전 서버 사유는 지운다 — 이번에 묻지 않은 것을 이번 답처럼 보이게 두지 않는다.
 *
 * `total`은 표에 있던 전체 줄 수다. 보낸 줄만 세면 화면 검증에 걸려 빠진 줄이 어디에도 세어지지
 * 않아, 담당자가 "몇 건이 처리되지 않았는지"를 합으로 확인할 수 없다.
 *
 * `unknownRowIds`는 **요청이 나갔는데 답을 받지 못한 줄**이다. 호출이 실패했다고 해서 서버가
 * 아무것도 만들지 않았다고 단정할 수 없다 — 커밋 뒤에 응답만 잃는 경우가 있다. 그 줄들은
 * 실패가 아니라 `RESULT_UNKNOWN`으로 남아 확인을 먼저 하게 한다.
 */
export function applyBatchOutcomes(
  rows: readonly GuestDraftRow[],
  submittedRowIds: readonly string[],
  outcomes: readonly GuestBatchOutcome[],
  unknownRowIds: readonly string[] = [],
): { remaining: GuestDraftRow[]; summary: GuestBatchSummary } {
  const submitted = new Set(submittedRowIds)
  const unknownIds = new Set(unknownRowIds)
  const byId = new Map(outcomes.map((o) => [o.rowId, o]))
  const remaining: GuestDraftRow[] = []
  let created = 0
  let unknown = 0

  for (const row of rows) {
    // 답을 못 받은 줄이 먼저다 — 그 줄은 보낸 줄 목록에 없지만 '안 보낸 줄'도 아니다.
    if (unknownIds.has(row.rowId)) {
      unknown += 1
      remaining.push({ ...row, serverIssues: [RESULT_UNKNOWN] })
      continue
    }
    if (!submitted.has(row.rowId)) {
      remaining.push({ ...row, serverIssues: [] })
      continue
    }
    const outcome = byId.get(row.rowId)
    if (outcome?.status === 'created') {
      created += 1
      continue
    }
    const issues = outcome
      ? outcome.issues.length > 0
        ? outcome.issues
        : [UNKNOWN_FAILURE]
      : [NO_ANSWER]
    remaining.push({ ...row, serverIssues: issues })
  }

  return {
    remaining,
    summary: { total: rows.length, created, failed: rows.length - created - unknown, unknown },
  }
}

/**
 * CSV 한 칸 — 표 도구가 **값을 값이 아닌 것으로 읽지 않도록** 감싼다.
 *
 * 세 가지를 한다.
 *
 *  · **제어문자를 걷는다.** 줄바꿈 하나가 칸 안에 남으면 되읽을 때 열이 어긋난다.
 *  · **수식 글자(`= + - @`)로 시작하는 값 앞에 홑따옴표를 세운다.** 우리가 내보내는 값에는
 *    서버 사유 문구와 담당자가 적은 이름이 들어가는데, 그중 하나가 `=HYPERLINK(...)`로 시작하면
 *    파일을 연 사람의 표 도구가 그것을 **실행한다.** 사유 문구를 빼면 파일이 쓸모없어지므로
 *    빼는 대신 값으로 못 박는다. 앞뒤 공백은 먼저 걷고 첫 글자를 본다 — 표 도구도 공백을 걷고
 *    읽으므로 ` =cmd`를 그냥 두면 막은 것이 아니다.
 *  · **0으로 시작하는 숫자열도 같은 방식으로 못 박는다.** `01012345678`이 숫자로 읽히면 앞의
 *    0이 사라져 연락처가 아닌 값이 되고, 그 파일을 그대로 다시 올리면 전 줄이 PHONE_INVALID다.
 *
 * `="..."` 꼴을 쓰지 않는 것은 그것이 바로 우리가 막으려는 수식이기 때문이다. 홑따옴표는
 * 되읽을 때 `readCell`이 **같은 조건으로만** 떼므로 고쳐서 다시 올리는 왕복이 성립한다.
 */
function csvCell(value: string): string {
  const cleaned = stripControlChars(value).trim()
  const guarded = needsCsvGuard(cleaned) ? `'${cleaned}` : cleaned
  return /[",\n\r]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded
}

/** 템플릿 CSV(헤더 + 예시 한 줄). */
export function buildGuestTemplateCsv(): string {
  return [
    GUEST_BATCH_HEADERS.join(','),
    ['홍길동', 'hong@example.com', '010-1234-5678'].map(csvCell).join(','),
  ].join('\n')
}

/**
 * 실패한 줄만 담은 CSV. **템플릿과 같은 세 열로 시작한다** — 사유를 보고 고친 뒤 그대로 다시
 * 올릴 수 있어야 한다(뒤에 붙는 `사유` 열은 헤더 매핑에서 무시된다).
 */
export function buildFailedRowsCsv(
  rows: readonly GuestDraftRow[],
  issues: ReadonlyMap<string, GuestRowIssue[]>,
): string {
  const lines = [[...GUEST_BATCH_HEADERS, '사유'].join(',')]
  for (const row of rows) {
    const reason = (issues.get(row.rowId) ?? []).map((i) => i.message).join(' / ')
    lines.push([row.name, row.email, row.phone, reason].map(csvCell).join(','))
  }
  return lines.join('\n')
}
