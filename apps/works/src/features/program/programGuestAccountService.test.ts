import { beforeEach, describe, expect, it, vi } from 'vitest'

/** GUEST 계정 추가 창구의 확정된 행 단위 응답 계약. */

const rpc = vi.fn()
vi.mock('@/lib/supabase', () => ({ supabase: { rpc: (...args: unknown[]) => rpc(...args) } }))

const {
  ADD_GUEST_ACCOUNTS_RPC,
  addProgramGuestAccounts,
  describeAddError,
  summarizeAddResult,
} = await import('@/features/program/programGuestAccountService')

beforeEach(() => {
  rpc.mockReset()
})

describe('summarizeAddResult', () => {
  it('행별 성공·기존·실패를 접는다', () => {
    expect(summarizeAddResult(['u1', 'u2', 'u3'], [
      { user_id: 'u1', status: 'ADDED', reason: null },
      { user_id: 'u2', status: 'ALREADY_PRESENT', reason: null },
      { user_id: 'u3', status: 'FAILED', reason: 'ACCOUNT_NOT_AVAILABLE' },
    ])).toEqual({
      added: 1,
      alreadyPresent: 1,
      failed: [{ userId: 'u3', status: 'FAILED', reason: 'ACCOUNT_NOT_AVAILABLE' }],
      unanswered: [],
    })
  })

  it('모르는 응답은 성공으로 지어내지 않는다', () => {
    expect(summarizeAddResult(['u1', 'u2'], { ok: true })).toEqual({
      added: 0,
      alreadyPresent: 0,
      failed: [],
      unanswered: ['u1', 'u2'],
    })
  })
})

describe('describeAddError', () => {
  it('창구 미배포는 따로 말한다 — 그때 담당자가 할 수 있는 일이 없다', () => {
    expect(describeAddError({ code: 'PGRST202', message: 'Could not find the function' })).toContain(
      ADD_GUEST_ACCOUNTS_RPC,
    )
  })

  it('인가 거절은 권한의 말로 옮긴다', () => {
    expect(describeAddError({ code: '42501', message: 'permission denied' })).toContain('권한')
  })

  it('그 밖의 사유는 서버의 말을 그대로 옮긴다', () => {
    expect(describeAddError({ message: '이미 종료된 사업입니다.' })).toBe('이미 종료된 사업입니다.')
  })
})

describe('addProgramGuestAccounts', () => {
  it('추가 창구 하나만 부른다 — 계정 생성 RPC는 부르지 않는다', async () => {
    rpc.mockResolvedValue({ data: [
      { user_id: 'u1', status: 'ADDED', reason: null },
      { user_id: 'u2', status: 'ADDED', reason: null },
    ], error: null })
    await addProgramGuestAccounts({
      entityKey: 'program',
      programId: 'prog-1',
      userIds: ['u1', 'u2'],
    })
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith(ADD_GUEST_ACCOUNTS_RPC, {
      p_entity_key: 'program',
      p_program_id: 'prog-1',
      p_user_ids: ['u1', 'u2'],
    })
    const called = rpc.mock.calls.map((c) => c[0])
    expect(called).not.toContain('create_guest_account')
    expect(called).not.toContain('issue_guest_account')
  })

  it('같은 계정이 두 번 실려 와도 한 번만 보낸다', async () => {
    rpc.mockResolvedValue({ data: [{ user_id: 'u1', status: 'ADDED', reason: null }], error: null })
    const out = await addProgramGuestAccounts({
      entityKey: 'fund',
      programId: 'f1',
      userIds: ['u1', 'u1'],
    })
    expect(rpc.mock.calls[0]![1]).toMatchObject({ p_user_ids: ['u1'] })
    expect(out.requested).toBe(1)
  })

  it('빈 목록은 서버까지 가지 않는다', async () => {
    const out = await addProgramGuestAccounts({ entityKey: 'ma_program', programId: 'm1', userIds: [] })
    expect(rpc).not.toHaveBeenCalled()
    expect(out).toEqual({
      requested: 0,
      added: 0,
      alreadyPresent: 0,
      failed: [],
      unanswered: [],
    })
  })

  it('서버가 행 결과를 답하지 않으면 전부 미확인으로 둔다', async () => {
    rpc.mockResolvedValue({ data: { ok: true }, error: null })
    const out = await addProgramGuestAccounts({
      entityKey: 'program',
      programId: 'prog-1',
      userIds: ['u1', 'u2'],
    })
    expect(out).toEqual({
      requested: 2,
      added: 0,
      alreadyPresent: 0,
      failed: [],
      unanswered: ['u1', 'u2'],
    })
  })

  it('실패는 담당자의 말로 바꿔 던진다', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'nope' } })
    await expect(
      addProgramGuestAccounts({ entityKey: 'program', programId: 'prog-1', userIds: ['u1'] }),
    ).rejects.toThrow(ADD_GUEST_ACCOUNTS_RPC)
  })
})
