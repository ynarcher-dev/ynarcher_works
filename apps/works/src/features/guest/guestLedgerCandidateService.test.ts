import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createGuestDraftRow,
  toGuestBatchPayload,
} from '@/features/guest/guestBatch'

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('@/lib/supabase', () => ({ supabase: { rpc: mocks.rpc } }))

const {
  fetchGuestLedgerCandidates,
  guestProfileFromLedgerCandidate,
} = await import('@/features/guest/guestLedgerCandidateService')

beforeEach(() => {
  mocks.rpc.mockReset()
})

describe('fetchGuestLedgerCandidates', () => {
  it('전체 원장 조회가 아니라 계정용 좁은 RPC에 검색·분류·결정적 페이지 범위만 보낸다', async () => {
    mocks.rpc.mockResolvedValue({ data: [], error: null })

    await fetchGuestLedgerCandidates({
      search: '  홍길동  ',
      page: 2,
      pageSize: 10,
      category: 'experts',
    })

    expect(mocks.rpc).toHaveBeenCalledWith('guest_account_ledger_candidates', {
      p_search: '홍길동',
      p_limit: 10,
      p_offset: 20,
      p_category: 'experts',
    })
  })

  it('허용된 계정 사본만 화면 모델로 옮기고 다른 원장 열은 버린다', async () => {
    mocks.rpc.mockResolvedValue({
      data: [
        {
          source_id: 'network-1',
          name: ' 홍길동 ',
          email: ' hong@example.com ',
          affiliation: ' 와이앤아처 ',
          total_count: '1',
          // DB 반환 계약이 넓어지는 회귀가 생겨도 애플리케이션 객체에는 섞이지 않아야 한다.
          phone: '010-1234-5678',
          company_id: 'company-1',
          master_table: 'network_master',
        },
      ],
      error: null,
    })

    const result = await fetchGuestLedgerCandidates({
      search: '',
      page: 0,
      pageSize: 10,
      category: null,
    })

    expect(result).toEqual({
      rows: [
        {
          sourceId: 'network-1',
          name: '홍길동',
          email: 'hong@example.com',
          affiliation: '와이앤아처',
        },
      ],
      total: 1,
    })
    expect(result.rows[0]).not.toHaveProperty('phone')
    expect(result.rows[0]).not.toHaveProperty('company_id')
    expect(result.rows[0]).not.toHaveProperty('master_table')
  })

  it('RPC 오류를 빈 후보 목록으로 숨기지 않는다', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: '권한이 없습니다.' } })

    await expect(
      fetchGuestLedgerCandidates({ search: '', page: 0, pageSize: 10, category: null }),
    ).rejects.toMatchObject({ message: '권한이 없습니다.' })
  })
})

describe('guestProfileFromLedgerCandidate', () => {
  it('sourceId는 선택 상태에서 끝나고 계정 초안에 복사할 세 문자열에 포함되지 않는다', () => {
    const profile = guestProfileFromLedgerCandidate({
      sourceId: 'network-1',
      name: '홍길동',
      email: 'hong@example.com',
      affiliation: '와이앤아처',
    })

    expect(profile).toEqual({
      name: '홍길동',
      email: 'hong@example.com',
      affiliation: '와이앤아처',
    })
    expect(profile).not.toHaveProperty('sourceId')
    expect(profile).not.toHaveProperty('master_id')

    const draft = createGuestDraftRow(profile)
    const payload = toGuestBatchPayload([draft])[0]
    expect(draft).not.toHaveProperty('sourceId')
    expect(payload).not.toHaveProperty('sourceId')
    expect(payload).toEqual({
      key: draft.rowId,
      name: '홍길동',
      email: 'hong@example.com',
      affiliation: '와이앤아처',
    })
  })
})
