import { describe, expect, it } from 'vitest'
import {
  applyBatchOutcomes,
  buildFailedRowsCsv,
  buildGuestTemplateCsv,
  chunkGuestRows,
  createGuestDraftRow,
  GUEST_BATCH_MAX_ROWS,
  guestRowIssues,
  parseGuestGrid,
  submittableGuestRows,
  toGuestBatchPayload,
  validateGuestRows,
  type GuestBatchOutcome,
  type GuestDraftRow,
} from '@/features/guest/guestBatch'

/**
 * 여러 줄 GUEST 계정 생성의 판정. **조회는 보지 않는다** — 이미 있는 계정과의 중복은 서버가
 * 답하는 물음이고, 여기서 지킬 것은 파일만 보고 답할 수 있는 셋이다: 열을 어떻게 읽는가,
 * 목록 안에서 무엇을 같은 값으로 보는가, 제출 결과를 표에 어떻게 되돌리는가.
 *
 * 사유 코드는 `public.create_guest_accounts`의 것을 그대로 쓴다 — 화면과 서버가 같은 결론을
 * 낼 때 사유가 두 줄로 서지 않아야 한다.
 */

const row = (seed: Partial<Omit<GuestDraftRow, 'rowId'>>): GuestDraftRow => createGuestDraftRow(seed)

const issuesOf = (map: ReadonlyMap<string, { field: string; code: string }[]>, r: GuestDraftRow) =>
  (map.get(r.rowId) ?? []).map((i) => `${i.field}:${i.code}`)

describe('parseGuestGrid', () => {
  it('한국어 헤더를 우리 칸으로 읽는다', () => {
    const parsed = parseGuestGrid([
      ['이름', '이메일', '연락처'],
      ['홍길동', 'hong@example.com', '010-1234-5678'],
    ])
    expect(parsed.fileIssues).toEqual([])
    expect(parsed.rows).toHaveLength(1)
    expect(parsed.rows[0]).toMatchObject({
      name: '홍길동',
      email: 'hong@example.com',
      phone: '010-1234-5678',
      masterTable: null,
      masterId: null,
    })
  })

  it('별칭 헤더와 열 순서 바뀜을 받아 준다 — 내려받은 파일을 손대지 않고 올릴 수 있어야 한다', () => {
    const parsed = parseGuestGrid([
      ['휴대폰', 'E-Mail', '성명'],
      ['01011112222', 'a@x.com', '김철수'],
    ])
    expect(parsed.rows[0]).toMatchObject({
      name: '김철수',
      email: 'a@x.com',
      phone: '01011112222',
    })
  })

  it('열이 빠지면 줄을 만들지 않고 헤더를 고치라고 답한다', () => {
    const parsed = parseGuestGrid([
      ['이름', '이메일'],
      ['홍길동', 'hong@example.com'],
    ])
    expect(parsed.rows).toEqual([])
    expect(parsed.fileIssues[0]).toContain('연락처')
  })

  it('세 칸이 모두 빈 줄은 건너뛴다 — 엑셀 꼬리의 빈 줄이 오류가 되면 안 된다', () => {
    const parsed = parseGuestGrid([
      ['이름', '이메일', '연락처'],
      ['홍길동', 'hong@example.com', '01012345678'],
      ['', '', ''],
      ['  ', '', ''],
    ])
    expect(parsed.rows).toHaveLength(1)
    expect(parsed.skipped).toBe(2)
  })

  it('일부만 빈 줄은 남긴다 — 화면에서 채우게 하고 조용히 버리지 않는다', () => {
    const parsed = parseGuestGrid([
      ['이름', '이메일', '연락처'],
      ['홍길동', '', ''],
    ])
    expect(parsed.rows).toHaveLength(1)
    expect(parsed.skipped).toBe(0)
  })

  it('빈 격자는 읽을 내용이 없다고 답한다', () => {
    expect(parseGuestGrid([]).fileIssues).toHaveLength(1)
  })

  it('템플릿을 그대로 되읽으면 예시 한 줄이 나온다', () => {
    const grid = buildGuestTemplateCsv()
      .split('\n')
      .map((line) => line.split(','))
    const parsed = parseGuestGrid(grid)
    expect(parsed.fileIssues).toEqual([])
    expect(parsed.rows).toHaveLength(1)
    expect(parsed.rows[0]!.email).toBe('hong@example.com')
  })
})

describe('validateGuestRows — 칸 검증(서버와 같은 잣대)', () => {
  it('세 칸이 다 차고 형식이 맞으면 사유가 없다', () => {
    const r = row({ name: '홍길동', email: 'hong@example.com', phone: '010-1234-5678' })
    expect(validateGuestRows([r]).size).toBe(0)
  })

  it('빈 칸과 형식 오류를 각각 그 칸에 붙인다', () => {
    const blank = row({ name: '', email: '', phone: '' })
    const bad = row({ name: '김철수', email: 'nope', phone: '없음' })
    const found = validateGuestRows([blank, bad])
    expect(issuesOf(found, blank)).toEqual([
      'name:NAME_REQUIRED',
      'email:EMAIL_REQUIRED',
      'phone:PHONE_REQUIRED',
    ])
    expect(issuesOf(found, bad)).toEqual(['email:EMAIL_INVALID', 'phone:PHONE_INVALID'])
  })

  it('연락처는 숫자 9~15자리다 — 서버(PHONE_INVALID)가 재는 범위를 그대로 잰다', () => {
    const eight = row({ name: 'A', email: 'a@x.com', phone: '0101-1112' })
    const long = row({ name: 'B', email: 'b@x.com', phone: '0101234567890123' })
    const intl = row({ name: 'C', email: 'c@x.com', phone: '+81 3-1234-5678' })
    const found = validateGuestRows([eight, long, intl])
    // 8자리는 2026-09-13 확정본에서 막힌다(종전 하한은 8이었다).
    expect(issuesOf(found, eight)).toEqual(['phone:PHONE_INVALID'])
    expect(issuesOf(found, long)).toEqual(['phone:PHONE_INVALID'])
    // 국제 표기는 숫자만 세므로 통과한다(표기가 아니라 자릿수가 기준이다).
    expect(found.has(intl.rowId)).toBe(false)
  })

  it('점이 없는 도메인과 점으로 끝나는 주소를 막는다 — 서버 식과 같은 판정이다', () => {
    const cases = ['a@localhost', 'a@x.', 'a@.com', 'a b@x.com', 'a@@x.com']
    for (const email of cases) {
      const r = row({ name: 'A', email, phone: '01011112222' })
      expect(issuesOf(validateGuestRows([r]), r), email).toEqual(['email:EMAIL_INVALID'])
    }
    // 여러 단 도메인은 통과한다.
    const ok = row({ name: 'A', email: 'a@sub.co.kr', phone: '01011112222' })
    expect(validateGuestRows([ok]).size).toBe(0)
  })

  it('이름은 100자를 넘지 못한다', () => {
    const r = row({ name: 'ㄱ'.repeat(101), email: 'a@x.com', phone: '01012345678' })
    expect(issuesOf(validateGuestRows([r]), r)).toEqual(['name:NAME_TOO_LONG'])
  })

  it('원장 id만 있고 종류가 없으면 연결이 온전하지 않다고 본다', () => {
    const r = row({
      name: '홍길동',
      email: 'a@x.com',
      phone: '01012345678',
      masterId: 'abc',
      masterTable: null,
    })
    expect(issuesOf(validateGuestRows([r]), r)).toEqual(['ledger:MASTER_PAIR_REQUIRED'])
  })
})

describe('chunkGuestRows', () => {
  it('서버가 한 번에 받는 상한으로 자른다 — 넘치면 호출 전체가 거절된다', () => {
    const many = Array.from({ length: GUEST_BATCH_MAX_ROWS + 1 }, (_, i) =>
      row({ name: `사람${i}`, email: `p${i}@x.com`, phone: `0101111${String(i).padStart(4, '0')}` }),
    )
    const parts = chunkGuestRows(many)
    expect(parts).toHaveLength(2)
    expect(parts[0]).toHaveLength(GUEST_BATCH_MAX_ROWS)
    expect(parts[1]).toHaveLength(1)
  })

  it('빈 목록은 묶음도 없다 — 서버는 빈 배열을 거절한다', () => {
    expect(chunkGuestRows([])).toEqual([])
  })
})

describe('validateGuestRows — 목록 안 중복', () => {
  it('대소문자·공백만 다른 이메일은 같은 값으로 보고 **겹친 줄을 모두** 실패로 세운다', () => {
    const a = row({ name: '홍길동', email: 'Hong@Example.com ', phone: '01011112222' })
    const b = row({ name: '홍길동', email: 'hong@example.com', phone: '01033334444' })
    const found = validateGuestRows([a, b])
    expect(issuesOf(found, a)).toEqual(['email:EMAIL_DUPLICATE_IN_BATCH'])
    expect(issuesOf(found, b)).toEqual(['email:EMAIL_DUPLICATE_IN_BATCH'])
    // 먼저 적은 줄이 살아남지 않는다 — 둘 중 무엇이 맞는지 파일만 보고는 알 수 없다.
    expect(submittableGuestRows([a, b])).toEqual([])
  })

  it('표기가 다른 같은 번호도 겹침이다 — 연락처는 숫자만 본다', () => {
    const a = row({ name: '홍길동', email: 'a@x.com', phone: '010-1111-2222' })
    const b = row({ name: '김철수', email: 'b@x.com', phone: '01011112222' })
    const found = validateGuestRows([a, b])
    expect(issuesOf(found, a)).toEqual(['phone:PHONE_DUPLICATE_IN_BATCH'])
    expect(issuesOf(found, b)).toEqual(['phone:PHONE_DUPLICATE_IN_BATCH'])
  })

  it('겹친 상대의 줄 번호를 사유에 적는다 — 무엇을 지울지 알 수 있어야 한다', () => {
    const a = row({ name: 'A', email: 'same@x.com', phone: '01011112222' })
    const b = row({ name: 'B', email: 'other@x.com', phone: '01033334444' })
    const c = row({ name: 'C', email: 'same@x.com', phone: '01055556666' })
    const found = validateGuestRows([a, b, c])
    expect(found.get(a.rowId)![0]!.message).toContain('3번째 줄')
    expect(found.get(c.rowId)![0]!.message).toContain('1번째 줄')
    expect(found.has(b.rowId)).toBe(false)
  })

  it('겹친 줄이 많으면 번호를 몇 개만 적고 나머지는 수로 답한다', () => {
    const many = Array.from({ length: 10 }, () =>
      row({ name: 'A', email: 'same@x.com', phone: '01011112222' }),
    )
    const found = validateGuestRows(many)
    const message = found.get(many[0]!.rowId)!.find((i) => i.field === 'email')!.message
    // 표본은 세 줄까지, 나머지는 수로 접는다(9 = 자기 자신을 뺀 겹침 수).
    expect(message).toContain('번째 줄 외 6줄에 더 적었습니다')
    expect(message.split('·')).toHaveLength(3)
    // 그래도 열 줄 전부가 실패다.
    expect(submittableGuestRows(many)).toEqual([])
  })

  it('같은 값 1만 줄도 선형으로 끝난다 — 전부 적으면 1억 번의 복사가 된다', () => {
    const many = Array.from({ length: 10000 }, () =>
      row({ name: 'A', email: 'same@x.com', phone: '01011112222' }),
    )
    const found = validateGuestRows(many)
    expect(found.size).toBe(10000)
    // 사유 문구가 줄 수에 비례해 길어지지 않는다(짧은 한 줄로 묶인다).
    for (const rowId of [many[0]!.rowId, many[5000]!.rowId, many[9999]!.rowId]) {
      const message = found.get(rowId)!.find((i) => i.field === 'email')!.message
      expect(message.length).toBeLessThan(120)
      expect(message).toContain('줄에 더 적었습니다')
    }
    expect(submittableGuestRows(many)).toEqual([])
  })

  it('빈 칸끼리는 겹침이 아니다 — 빈 칸은 이미 필수 사유가 따로 선다', () => {
    const a = row({ name: 'A', email: '', phone: '' })
    const b = row({ name: 'B', email: '', phone: '' })
    const found = validateGuestRows([a, b])
    expect(issuesOf(found, a)).toEqual(['email:EMAIL_REQUIRED', 'phone:PHONE_REQUIRED'])
  })

  it('겹치지 않은 줄은 그대로 보낸다 — 한 줄이 막혀도 나머지는 간다', () => {
    const ok = row({ name: '홍길동', email: 'ok@x.com', phone: '01099998888' })
    const a = row({ name: 'A', email: 'dup@x.com', phone: '01011112222' })
    const b = row({ name: 'B', email: 'dup@x.com', phone: '01033334444' })
    expect(submittableGuestRows([ok, a, b]).map((r) => r.rowId)).toEqual([ok.rowId])
  })
})

describe('toGuestBatchPayload', () => {
  it('계약 모양으로 접되 값은 적힌 그대로 보낸다 — 정규화는 서버가 소유한다', () => {
    const r = row({
      name: ' 홍길동 ',
      email: ' Hong@Example.com ',
      phone: ' 010-1234-5678 ',
      masterTable: 'startups',
      masterId: 'uuid-1',
      masterName: '와이앤아처',
    })
    expect(toGuestBatchPayload([r])).toEqual([
      {
        key: r.rowId,
        name: '홍길동',
        email: 'Hong@Example.com',
        phone: '010-1234-5678',
        master_table: 'startups',
        master_id: 'uuid-1',
      },
    ])
  })

  it('연결하지 않은 줄은 원장 두 칸이 모두 null이다(서버가 짝을 요구한다)', () => {
    const r = row({ name: 'A', email: 'a@x.com', phone: '01011112222' })
    expect(toGuestBatchPayload([r])[0]).toMatchObject({ master_table: null, master_id: null })
  })
})

describe('applyBatchOutcomes — 부분 성공과 재시도', () => {
  const created = (rowId: string): GuestBatchOutcome => ({
    rowId,
    status: 'created',
    userId: `user-${rowId}`,
    issues: [],
  })
  const failed = (rowId: string, message: string): GuestBatchOutcome => ({
    rowId,
    status: 'failed',
    userId: null,
    issues: [{ field: 'email', code: 'EMAIL_TAKEN_GUEST', message }],
  })

  it('성공한 줄은 표에서 빠지고 실패한 줄만 사유를 달고 남는다', () => {
    const a = row({ name: 'A', email: 'a@x.com', phone: '01011112222' })
    const b = row({ name: 'B', email: 'b@x.com', phone: '01033334444' })
    const applied = applyBatchOutcomes(
      [a, b],
      [a.rowId, b.rowId],
      [created(a.rowId), failed(b.rowId, '같은 이메일의 계정이 이미 있습니다.')],
    )
    expect(applied.summary).toEqual({ total: 2, created: 1, failed: 1, unknown: 0 })
    expect(applied.remaining.map((r) => r.rowId)).toEqual([b.rowId])
    expect(applied.remaining[0]!.serverIssues[0]!.code).toBe('EMAIL_TAKEN_GUEST')
  })

  it('남은 줄만 다시 보낸다 — 이미 만들어진 계정이 두 번 가지 않는다', () => {
    const a = row({ name: 'A', email: 'a@x.com', phone: '01011112222' })
    const b = row({ name: 'B', email: 'b@x.com', phone: '01033334444' })
    const first = applyBatchOutcomes(
      [a, b],
      [a.rowId, b.rowId],
      [created(a.rowId), failed(b.rowId, '중복')],
    )
    // 사유를 보고 고친 뒤 다시 누른다.
    const fixed = first.remaining.map((r) => ({ ...r, email: 'fixed@x.com' }))
    expect(submittableGuestRows(fixed).map((r) => r.rowId)).toEqual([b.rowId])

    const second = applyBatchOutcomes(fixed, [b.rowId], [created(b.rowId)])
    expect(second.summary).toEqual({ total: 1, created: 1, failed: 0, unknown: 0 })
    expect(second.remaining).toEqual([])
  })

  it('보내지 않은 줄(화면 검증에 걸린 줄)은 남고 직전 서버 사유는 지운다', () => {
    const ok = row({ name: 'A', email: 'a@x.com', phone: '01011112222' })
    const bad = row({
      name: '',
      email: 'b@x.com',
      phone: '01033334444',
      serverIssues: [{ field: 'row', code: 'FAILED', message: '옛 사유' }],
    })
    const applied = applyBatchOutcomes([ok, bad], [ok.rowId], [created(ok.rowId)])
    // total은 표 전체다 — 보낸 줄만 세면 걸러진 줄이 어디에도 세어지지 않는다.
    expect(applied.summary).toEqual({ total: 2, created: 1, failed: 1, unknown: 0 })
    expect(applied.remaining[0]!.serverIssues).toEqual([])
  })

  it('서버가 답하지 않은 줄을 성공으로 읽지 않는다', () => {
    const a = row({ name: 'A', email: 'a@x.com', phone: '01011112222' })
    const applied = applyBatchOutcomes([a], [a.rowId], [])
    expect(applied.summary).toEqual({ total: 1, created: 0, failed: 1, unknown: 0 })
    expect(applied.remaining[0]!.serverIssues[0]!.code).toBe('NO_ANSWER')
  })

  it('사유 없는 실패에도 고칠 말을 붙인다', () => {
    const a = row({ name: 'A', email: 'a@x.com', phone: '01011112222' })
    const applied = applyBatchOutcomes(
      [a],
      [a.rowId],
      [{ rowId: a.rowId, status: 'failed', userId: null, issues: [] }],
    )
    expect(applied.remaining[0]!.serverIssues[0]!.code).toBe('FAILED')
  })

  it('답을 못 받은 줄은 실패가 아니라 **결과 확인 필요**로 남는다', () => {
    const a = row({ name: 'A', email: 'a@x.com', phone: '01011112222' })
    const b = row({ name: 'B', email: 'b@x.com', phone: '01033334444' })
    const c = row({ name: 'C', email: 'c@x.com', phone: '01055556666' })
    // a는 답을 받았고(성공), b는 요청이 나간 뒤 답을 잃었고, c는 아예 보내지 않았다.
    const applied = applyBatchOutcomes([a, b, c], [a.rowId], [created(a.rowId)], [b.rowId])
    expect(applied.summary).toEqual({ total: 3, created: 1, failed: 1, unknown: 1 })
    expect(applied.remaining.map((r) => r.rowId)).toEqual([b.rowId, c.rowId])
    // 확인이 필요한 줄과 보내지 않은 줄이 갈린다 — 다음 행동이 다르다.
    expect(applied.remaining[0]!.serverIssues[0]!.code).toBe('RESULT_UNKNOWN')
    expect(applied.remaining[0]!.serverIssues[0]!.message).toContain('계정 목록')
    expect(applied.remaining[1]!.serverIssues).toEqual([])
  })

  it('첫 호출부터 답을 잃어도 "아무것도 안 만들어졌다"고 하지 않는다', () => {
    const a = row({ name: 'A', email: 'a@x.com', phone: '01011112222' })
    const applied = applyBatchOutcomes([a], [], [], [a.rowId])
    expect(applied.summary).toEqual({ total: 1, created: 0, failed: 0, unknown: 1 })
    expect(applied.remaining[0]!.serverIssues[0]!.code).toBe('RESULT_UNKNOWN')
  })

  it('결과 확인 필요 줄도 고쳐서 다시 보낼 수 있다 — 확인이 먼저라고 말할 뿐 막지는 않는다', () => {
    const a = row({ name: 'A', email: 'a@x.com', phone: '01011112222' })
    const applied = applyBatchOutcomes([a], [], [], [a.rowId])
    expect(submittableGuestRows(applied.remaining).map((r) => r.rowId)).toEqual([a.rowId])
  })

  it('모르는 줄의 결과는 버린다 — 순서로 맞추지 않는다', () => {
    const a = row({ name: 'A', email: 'a@x.com', phone: '01011112222' })
    const applied = applyBatchOutcomes([a], [a.rowId], [created('없는줄')])
    expect(applied.summary).toEqual({ total: 1, created: 0, failed: 1, unknown: 0 })
    expect(applied.remaining[0]!.serverIssues[0]!.code).toBe('NO_ANSWER')
  })
})

describe('guestRowIssues · buildFailedRowsCsv', () => {
  it('화면 검증과 서버 사유를 한 표에 모은다', () => {
    const r = row({
      name: '',
      email: 'a@x.com',
      phone: '01011112222',
      serverIssues: [{ field: 'email', code: 'EMAIL_TAKEN_GUEST', message: '이미 있습니다.' }],
    })
    expect(issuesOf(guestRowIssues([r]), r)).toEqual([
      'name:NAME_REQUIRED',
      'email:EMAIL_TAKEN_GUEST',
    ])
  })

  it('같은 칸·같은 코드는 두 번 세우지 않는다 — 화면과 서버가 같은 코드를 쓰기 때문이다', () => {
    const r = row({
      name: '홍길동',
      email: 'nope',
      phone: '01011112222',
      serverIssues: [{ field: 'email', code: 'EMAIL_INVALID', message: '이메일 형식이 올바르지 않습니다.' }],
    })
    expect(issuesOf(guestRowIssues([r]), r)).toEqual(['email:EMAIL_INVALID'])
  })

  it('수식으로 시작하는 값은 홑따옴표로 못 박는다 — 파일을 연 표 도구가 실행하지 못한다', () => {
    for (const evil of ['=HYPERLINK("http://x","클릭")', '+1+1', '-2+3', '@SUM(A1)', '  =cmd|calc']) {
      const r = row({ name: evil, email: 'a@x.com', phone: '01011112222' })
      const csv = buildFailedRowsCsv([r], guestRowIssues([r]))
      const cell = csv.split('\n')[1]!
      // 따옴표로 감싸든 아니든 첫 글자는 수식 글자가 아니어야 한다.
      expect(cell.replace(/^"/, '').startsWith("'"), evil).toBe(true)
    }
  })

  it('사유 문구가 수식이어도 같다 — 서버 문구를 빼지 않고 값으로 못 박는다', () => {
    const r = row({
      name: '홍길동',
      email: 'a@x.com',
      phone: '01011112222',
      serverIssues: [{ field: 'row', code: 'DB_ERROR', message: '=1+1 오류' }],
    })
    const reason = buildFailedRowsCsv([r], guestRowIssues([r])).split('\n')[1]!.split(',').pop()!
    expect(reason.startsWith("'")).toBe(true)
    expect(reason).toContain('=1+1 오류')
  })

  it('제어문자는 걷는다 — 칸 안의 줄바꿈이 남으면 되읽을 때 열이 어긋난다', () => {
    const r = row({ name: '홍\n길동\t씨', email: 'a@x.com', phone: '01011112222' })
    const csv = buildFailedRowsCsv([r], guestRowIssues([r]))
    expect(csv.split('\n')).toHaveLength(2)
    expect(csv).toContain('홍 길동 씨')
  })

  it('0으로 시작하는 연락처를 지키고, 되읽으면 원래 값으로 돌아온다', () => {
    const r = row({ name: '홍길동', email: 'a@x.com', phone: '01011112222' })
    const csv = buildFailedRowsCsv([r], guestRowIssues([r]))
    // 표 도구가 숫자로 읽어 앞의 0을 지우지 못하게 못 박는다.
    expect(csv).toContain("'01011112222")
    // 그 표기는 우리가 붙인 것이므로 되읽을 때 떼어 낸다(고쳐서 다시 올리는 왕복).
    const grid = csv.split('\n').map((line) => line.split(','))
    expect(parseGuestGrid(grid).rows[0]).toMatchObject({
      name: '홍길동',
      phone: '01011112222',
    })
  })

  it("정상 값의 홑따옴표는 지키지 않는다 — 붙인 조건과 뗄 조건이 같아야 한다", () => {
    const parsed = parseGuestGrid([
      ['이름', '이메일', '연락처'],
      ["'철수", 'a@x.com', '01011112222'],
    ])
    expect(parsed.rows[0]!.name).toBe("'철수")
  })

  it('실패 줄 파일은 템플릿과 같은 세 열로 시작해 그대로 되읽힌다', () => {
    const r = row({
      name: '홍, 길동',
      email: 'a@x.com',
      phone: '01011112222',
      serverIssues: [{ field: 'email', code: 'EMAIL_TAKEN_GUEST', message: '이미 있습니다.' }],
    })
    const csv = buildFailedRowsCsv([r], guestRowIssues([r]))
    const grid = csv.split('\n').map((line) => line.split(','))
    // 쉼표가 든 이름은 따옴표로 감싼다(되읽을 때 열이 어긋나지 않게).
    expect(csv).toContain('"홍, 길동"')
    expect(grid[0]).toEqual(['이름', '이메일', '연락처', '사유'])
    // 뒤에 붙은 사유 열은 헤더 매핑에서 무시되고 세 칸은 그대로 돌아온다.
    const back = parseGuestGrid([grid[0]!, ['홍길동', 'a@x.com', '01011112222', '이미 있습니다.']])
    expect(back.fileIssues).toEqual([])
    expect(back.rows[0]).toMatchObject({ name: '홍길동', email: 'a@x.com', phone: '01011112222' })
  })
})
