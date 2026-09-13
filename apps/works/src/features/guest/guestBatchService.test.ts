import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GUEST_BATCH_MAX_ROWS, type GuestBatchPayloadRow } from '@/features/guest/guestBatch'

/**
 * 서버 계약을 읽는 층. **RPC를 가짜로 세우고 응답 모양만 본다** — 권한·중복 판정은 DB가 지고
 * (pgTAP `guest_account_batch_create_test.sql`), 여기서 지킬 것은 그 답을 화면 줄에 잘못 붙이지
 * 않는 것이다.
 *
 * 특히 **'모르는 값을 성공으로 읽지 않는다'**가 요점이다. 상태 문자열이 바뀌거나 줄 식별자가
 * 빠졌을 때 조용히 성공으로 접히면, 만들어지지 않은 계정이 표에서 사라져 아무도 다시 만들지
 * 않는다.
 */

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('@/lib/supabase', () => ({ supabase: { rpc: mocks.rpc } }))

const { createGuestAccountsBatch } = await import('@/features/guest/guestBatchService')

const payload = (key: string): GuestBatchPayloadRow => ({
  key,
  name: '홍길동',
  email: 'hong@example.com',
  phone: '010-1234-5678',
  master_table: null,
  master_id: null,
})

const answer = (rows: unknown[]) => ({
  data: { total: rows.length, created: 0, failed: rows.length, rows },
  error: null,
})

beforeEach(() => {
  mocks.rpc.mockReset()
})

describe('createGuestAccountsBatch', () => {
  it('계약 이름과 인자로 보낸다', async () => {
    mocks.rpc.mockResolvedValue(answer([]))
    await createGuestAccountsBatch([payload('row-1')])
    expect(mocks.rpc).toHaveBeenCalledWith('create_guest_accounts', {
      p_rows: [payload('row-1')],
    })
  })

  it('CREATED 줄은 key로 되돌리고 user_id를 들고 온다', async () => {
    mocks.rpc.mockResolvedValue(
      answer([
        {
          index: 0,
          key: 'row-1',
          status: 'CREATED',
          user_id: 'u-1',
          user_type: 'temporary_guest',
          errors: [],
        },
      ]),
    )
    expect(await createGuestAccountsBatch([payload('row-1')])).toEqual([
      { rowId: 'row-1', status: 'created', userId: 'u-1', issues: [] },
    ])
  })

  it('실패 사유의 칸 이름을 화면의 칸으로 옮긴다 — 원장 두 칸은 연결 칸 하나다', async () => {
    mocks.rpc.mockResolvedValue(
      answer([
        {
          index: 0,
          key: 'row-1',
          status: 'FAILED',
          user_id: null,
          errors: [
            { field: 'master_table', code: 'MASTER_FORBIDDEN', message: '권한이 없습니다.' },
            { field: 'key', code: 'KEY_DUPLICATE_IN_BATCH', message: 'key가 겹칩니다.' },
            { field: '알수없는칸', code: 'X', message: '모르는 칸' },
          ],
        },
      ]),
    )
    const [outcome] = await createGuestAccountsBatch([payload('row-1')])
    expect(outcome!.issues.map((i) => i.field)).toEqual(['ledger', 'row', 'row'])
    // 사유 문구는 서버 것을 그대로 옮긴다(무엇과 겹쳤는지는 서버가 이미 감춘다).
    expect(outcome!.issues[0]!.message).toBe('권한이 없습니다.')
  })

  it('CREATED가 아니면 실패다 — 모르는 상태를 성공으로 읽지 않는다', async () => {
    mocks.rpc.mockResolvedValue(
      answer([{ index: 0, key: 'row-1', status: 'created', user_id: 'u-1', errors: [] }]),
    )
    const [outcome] = await createGuestAccountsBatch([payload('row-1')])
    expect(outcome!.status).toBe('failed')
    expect(outcome!.userId).toBeNull()
  })

  it('key 없는 줄은 버린다 — 순서로 맞추면 한 줄만 어긋나도 전부 어긋난다', async () => {
    mocks.rpc.mockResolvedValue(
      answer([{ index: 0, status: 'CREATED', user_id: 'u-1', errors: [] }]),
    )
    expect(await createGuestAccountsBatch([payload('row-1')])).toEqual([])
  })

  it('문구 없는 사유는 세우지 않는다 — 빈 줄이 붉게 서면 무엇을 고칠지 알 수 없다', async () => {
    mocks.rpc.mockResolvedValue(
      answer([
        {
          index: 0,
          key: 'row-1',
          status: 'FAILED',
          user_id: null,
          errors: [{ field: 'email', code: 'EMAIL_INVALID', message: '   ' }],
        },
      ]),
    )
    const [outcome] = await createGuestAccountsBatch([payload('row-1')])
    expect(outcome!.issues).toEqual([])
  })

  it('rows가 배열이 아니면 던진다 — 읽지 못한 응답을 빈 결과로 접지 않는다', async () => {
    mocks.rpc.mockResolvedValue({ data: { total: 1, created: 1, failed: 0 }, error: null })
    await expect(createGuestAccountsBatch([payload('row-1')])).rejects.toThrow('서버 응답')
  })

  it('RPC가 거절하면 그 오류를 그대로 올린다', async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { message: '내부 사용자만 GUEST 계정을 생성할 수 있습니다.' },
    })
    await expect(createGuestAccountsBatch([payload('row-1')])).rejects.toMatchObject({
      message: '내부 사용자만 GUEST 계정을 생성할 수 있습니다.',
    })
  })

  it('빈 목록은 보내지 않는다 — 서버는 빈 배열을 호출 전체 거절로 답한다', async () => {
    expect(await createGuestAccountsBatch([])).toEqual([])
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('상한을 넘는 묶음은 보내기 전에 막는다', async () => {
    const many = Array.from({ length: GUEST_BATCH_MAX_ROWS + 1 }, (_, i) => payload(`row-${i}`))
    await expect(createGuestAccountsBatch(many)).rejects.toThrow(String(GUEST_BATCH_MAX_ROWS))
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
})
