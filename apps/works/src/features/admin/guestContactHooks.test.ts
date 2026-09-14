import { describe, expect, it } from 'vitest'
import { GUEST_INITIAL_PASSWORD } from '@/features/guest/guestAccountService'
import {
  GUEST_PASSWORD_RESET_CONFIRM,
  applyGuestContactUpdate,
  applyGuestPasswordReset,
  guestAdminActionState,
  guestAdminErrorMessage,
  hasGuestContactError,
  resolveGuestDetail,
  validateGuestContact,
  type GuestContactUpdateResult,
  type GuestPasswordResetResult,
} from '@/features/admin/guestContactHooks'

/**
 * ADMIN 프로필 수정·비밀번호 초기화의 판정 층.
 *
 * 서버가 같은 결론을 다시 내리지만, 화면의 판정이 서버보다 느슨하면 담당자가 통과시킨 값이
 * 서버에서 막히고 더 엄하면 서버가 받는 값을 화면이 거절한다. 그 어긋남을 여기서 붙잡는다.
 */

const ok = {
  name: '홍길동',
  email: 'guest@example.com',
  affiliation: '와이앤아처',
  reason: '오타 수정',
}

describe('validateGuestContact', () => {
  it('프로필 세 칸과 사유가 채워지면 통과한다', () => {
    expect(validateGuestContact(ok)).toEqual({})
    expect(hasGuestContactError(validateGuestContact(ok))).toBe(false)
  })

  it('사유가 비면 막는다 — 감사 로그에 남을 근거가 없으면 서버도 거절한다', () => {
    expect(validateGuestContact({ ...ok, reason: '   ' }).reason).toBeTruthy()
  })

  it('이메일이 비면 막는다 — 로그인 ID라 지울 수 없다', () => {
    expect(validateGuestContact({ ...ok, email: '' }).email).toBeTruthy()
  })

  it('이름과 소속이 비면 막는다 — 계정 프로필의 필수 값이다', () => {
    expect(validateGuestContact({ ...ok, name: '' }).name).toBeTruthy()
    expect(validateGuestContact({ ...ok, affiliation: '' }).affiliation).toBeTruthy()
  })

  it('이름은 100자, 소속은 200자를 넘지 못한다', () => {
    expect(validateGuestContact({ ...ok, name: '가'.repeat(100) }).name).toBeUndefined()
    expect(validateGuestContact({ ...ok, name: '가'.repeat(101) }).name).toBeTruthy()
    expect(validateGuestContact({ ...ok, affiliation: '가'.repeat(200) }).affiliation).toBeUndefined()
    expect(validateGuestContact({ ...ok, affiliation: '가'.repeat(201) }).affiliation).toBeTruthy()
  })

  it.each(['guest', 'guest@', 'guest@example', 'a b@example.com', 'a@@example.com'])(
    '이메일 형식을 거절한다: %s',
    (email) => {
      expect(validateGuestContact({ ...ok, email }).email).toBeTruthy()
    },
  )

  it('대소문자·앞뒤 공백만 다른 이메일은 통과한다(서버가 소문자로 정규화한다)', () => {
    expect(validateGuestContact({ ...ok, email: '  GUEST@Example.COM ' }).email).toBeUndefined()
  })

  it('254자를 넘는 이메일은 거절한다', () => {
    const long = `${'a'.repeat(250)}@example.com`
    expect(validateGuestContact({ ...ok, email: long }).email).toBeTruthy()
  })

})

describe('guestAdminActionState', () => {
  const account = { user_id: 'u-1' }

  it('ADMIN이 아니면 두 창구가 서지 않는다', () => {
    expect(guestAdminActionState({ canAdminister: false, account, pending: false })).toEqual({
      visible: false,
      canEditContact: false,
      canResetPassword: false,
    })
  })

  it('ADMIN이면 둘 다 선다', () => {
    expect(guestAdminActionState({ canAdminister: true, account, pending: false })).toEqual({
      visible: true,
      canEditContact: true,
      canResetPassword: true,
    })
  })

  it('요청이 도는 동안에는 둘 다 누르지 못한다(중복 제출 방지)', () => {
    const state = guestAdminActionState({ canAdminister: true, account, pending: true })
    expect(state.visible).toBe(true)
    expect(state.canEditContact).toBe(false)
    expect(state.canResetPassword).toBe(false)
  })

  it('프로필 값과 무관하게 초기화할 수 있다 — 최초 비밀번호가 고정값이다', () => {
    const state = guestAdminActionState({ canAdminister: true, account, pending: false })
    expect(state.canResetPassword).toBe(true)
  })

  it('상세가 닫혀 있으면 서지 않는다', () => {
    expect(
      guestAdminActionState({ canAdminister: true, account: null, pending: false }).visible,
    ).toBe(false)
  })
})

describe('guestAdminErrorMessage', () => {
  it('서버가 보낸 문구를 그대로 세운다 — 무엇을 고쳐야 하는지는 서버만 안다', () => {
    expect(
      guestAdminErrorMessage(
        { message: '이 이메일은 이미 다른 계정(홍길동)이 쓰고 있습니다.' },
        '실패했습니다.',
      ),
    ).toBe('이 이메일은 이미 다른 계정(홍길동)이 쓰고 있습니다.')
  })

  it('문구가 없거나 공백뿐이면 기본 문구로 답한다(빈 경고를 세우지 않는다)', () => {
    expect(guestAdminErrorMessage({ message: '   ' }, '실패했습니다.')).toBe('실패했습니다.')
    expect(guestAdminErrorMessage({}, '실패했습니다.')).toBe('실패했습니다.')
    expect(guestAdminErrorMessage(null, '실패했습니다.')).toBe('실패했습니다.')
    expect(guestAdminErrorMessage(undefined, '실패했습니다.')).toBe('실패했습니다.')
  })
})

/**
 * 상세가 무엇을 그리는가 — 목록이 답한 값과 누른 순간의 사본 사이의 규칙.
 *
 * 이 묶음은 회귀 시험이다. 사본을 손대지 않으면 **검색어가 옛 이메일에 걸려 있던 경우**
 * 상세가 영구히 옛 값으로 남는다(목록에서 그 계정이 빠져 답해 줄 자리가 없어진다).
 */
const ACCOUNT = {
  user_id: 'u-1',
  name: '홍길동',
  email: 'old@example.com',
  affiliation: '옛 소속',
  has_password: true,
}

const updated = (over: Partial<GuestContactUpdateResult> = {}): GuestContactUpdateResult => ({
  user_id: 'u-1',
  changed: true,
  name_changed: true,
  email_changed: true,
  affiliation_changed: true,
  session_version: 2,
  applied: { name: '김수정', email: 'new@example.com', affiliation: '와이앤아처' },
  ...over,
})

const resetDone = (over: Partial<GuestPasswordResetResult> = {}): GuestPasswordResetResult => ({
  user_id: 'u-1',
  had_password: true,
  session_version: 3,
  sessions_invalidated: true,
  ...over,
})

describe('resolveGuestDetail', () => {
  it('목록에 있으면 조회가 답한 값이 사본을 이긴다', () => {
    const fresh = { ...ACCOUNT, email: 'fresh@example.com' }
    expect(resolveGuestDetail(ACCOUNT, [fresh])?.email).toBe('fresh@example.com')
  })

  it('목록에서 빠지면 사본으로 버틴다(창이 저절로 닫히지 않는다)', () => {
    expect(resolveGuestDetail(ACCOUNT, [])).toBe(ACCOUNT)
  })

  it('사본이 없으면 그릴 상세도 없다', () => {
    expect(resolveGuestDetail(null, [ACCOUNT])).toBeNull()
  })
})

describe('applyGuestContactUpdate', () => {
  it('서버가 저장한 값으로 사본을 올린다', () => {
    const next = applyGuestContactUpdate(ACCOUNT, updated())
    expect(next).toMatchObject({
      name: '김수정',
      email: 'new@example.com',
      affiliation: '와이앤아처',
    })
  })

  it('아무것도 쓰지 않은 재전송은 사본을 건드리지 않는다 — 저장되지 않은 입력을 세우지 않는다', () => {
    const noop = updated({ changed: false, email_changed: false, applied: null })
    expect(applyGuestContactUpdate(ACCOUNT, noop)).toBe(ACCOUNT)
  })

  it('다른 계정의 응답으로 사본을 덮지 않는다', () => {
    expect(applyGuestContactUpdate(ACCOUNT, updated({ user_id: 'u-2' }))).toBe(ACCOUNT)
  })

  it('사본이 없으면 아무것도 만들지 않는다', () => {
    expect(applyGuestContactUpdate(null, updated())).toBeNull()
  })

  it('회귀: 검색어가 옛 이메일에 걸려 있어 목록에서 빠져도 상세는 새 이메일을 답한다', () => {
    // 담당자가 'old@example.com'으로 검색해 계정을 열고 이메일을 고쳤다. 새 목록은
    // 검색어와 맞지 않는 그 계정을 더는 세우지 않는다.
    const snapshot = applyGuestContactUpdate(ACCOUNT, updated())
    const rowsAfterRefresh: typeof ACCOUNT[] = []
    expect(resolveGuestDetail(snapshot, rowsAfterRefresh)?.email).toBe('new@example.com')
  })

  it('회귀: 실패·재전송이면 목록에서 빠져도 옛 값 그대로다(화면이 DB보다 앞서지 않는다)', () => {
    const noop = updated({ changed: false, email_changed: false, applied: null })
    const snapshot = applyGuestContactUpdate(ACCOUNT, noop)
    expect(resolveGuestDetail(snapshot, [])?.email).toBe('old@example.com')
  })
})

describe('applyGuestPasswordReset', () => {
  it('초기화가 통했으면 사본도 개시 상태가 된다', () => {
    expect(applyGuestPasswordReset(ACCOUNT, resetDone())?.has_password).toBe(false)
  })

  it('이미 개시 상태면 사본을 새로 만들지 않는다', () => {
    const fresh = { ...ACCOUNT, has_password: false }
    expect(applyGuestPasswordReset(fresh, resetDone({ had_password: false }))).toBe(fresh)
  })

  it('다른 계정의 응답으로 사본을 덮지 않는다', () => {
    expect(applyGuestPasswordReset(ACCOUNT, resetDone({ user_id: 'u-2' }))).toBe(ACCOUNT)
  })

  it('회귀: 목록에서 이미 빠진 계정을 초기화해도 상세가 "본인 설정 완료"로 남지 않는다', () => {
    // 앞선 이메일 수정으로 목록에서 빠진 상태에서 그대로 초기화한 경우다.
    const afterEdit = applyGuestContactUpdate(ACCOUNT, updated())
    const afterReset = applyGuestPasswordReset(afterEdit, resetDone())
    const detail = resolveGuestDetail(afterReset, [])
    expect(detail?.has_password).toBe(false)
    expect(detail?.email).toBe('new@example.com')
  })
})

describe('최초 비밀번호와 초기화 확인 문구', () => {
  it('최초 비밀번호는 계정과 무관한 고정값이다(2026-09-14 사용자 확정)', () => {
    expect(GUEST_INITIAL_PASSWORD).toBe('ynarcher')
  })

  it('확인 문구는 고정 최초 비밀번호를 말하고 연락처를 말하지 않는다', () => {
    expect(GUEST_PASSWORD_RESET_CONFIRM).toContain(GUEST_INITIAL_PASSWORD)
    expect(GUEST_PASSWORD_RESET_CONFIRM).toContain('안내는 발송하지 않습니다')
    // 연락처가 초기 비밀번호이던 시절의 문구가 되살아나지 않게 못 박는다.
    expect(GUEST_PASSWORD_RESET_CONFIRM).not.toContain('전화번호')
  })
})
