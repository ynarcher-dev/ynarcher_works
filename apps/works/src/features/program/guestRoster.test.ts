import { describe, expect, it } from 'vitest'
import {
  buildLeftRows,
  buildRightRows,
  dropStaged,
  isGuestRosterRow,
  stageAccount,
  toGuestRosterRows,
  type GuestRosterRow,
} from '@/features/program/guestRoster'
import type { GuestAccountCandidate, ParticipantRow } from '@/features/program/participantHooks'

/**
 * GUEST 계정 명부의 판정. 지키는 것은 넷이다.
 *
 *  · 원장 없는 게스트 계정이 명부에 선다(종전에는 `임직원`으로 불리며 걸러졌다).
 *  · 실제 내부 임직원만 걸러진다.
 *  · '이미 담김'은 **계정 id**로 판정한다 — 원장 id로 보면 원장 없는 계정을 판정할 수 없다.
 *  · 같은 계정을 두 번 올려도 한 번만 나가고, 끝난 일은 대기 목록에서 지워져 다시 나가지 않는다.
 */

function row(over: Partial<ParticipantRow>): ParticipantRow {
  return {
    id: 'p1',
    master_table: null,
    master_id: null,
    user_id: 'u1',
    login_status: 'NOT_ALLOWED',
    hasAccount: true,
    accountId: 'u1',
    accountName: '김게스트',
    accountEmail: 'guest@example.com',
    userType: 'temporary_guest',
    isGuestAccount: true,
    lastLoginAt: null,
    createdByName: null,
    targetName: '김게스트',
    subtitle: '',
    loginName: null,
    email: 'guest@example.com',
    phone: '01000000000',
    masterCategory: null,
    ...over,
  }
}

function candidate(over: Partial<GuestAccountCandidate>): GuestAccountCandidate {
  return {
    userId: 'u9',
    name: '박후보',
    email: 'cand@example.com',
    phone: '01099999999',
    isActive: true,
    identities: [],
    ...over,
  }
}

function roster(over: Partial<GuestRosterRow>): GuestRosterRow {
  return {
    participantId: 'p1',
    userId: 'u1',
    accountName: '김게스트',
    accountEmail: 'guest@example.com',
    accountPhone: '01000000000',
    source: null,
    ...over,
  }
}

describe('isGuestRosterRow', () => {
  it('원장이 없어도 게스트 계정이면 명부에 선다', () => {
    expect(isGuestRosterRow(row({ master_table: null, userType: 'temporary_guest' }))).toBe(true)
  })

  it('원장이 붙은 게스트 계정도 선다', () => {
    expect(
      isGuestRosterRow(row({ master_table: 'startups', master_id: 's1', userType: 'external_startup' })),
    ).toBe(true)
  })

  it('내부 임직원 계정이 달린 줄만 빠진다', () => {
    expect(isGuestRosterRow(row({ userType: 'internal', isGuestAccount: false }))).toBe(false)
  })

  it('유형을 모르는 계정은 게스트로 보지 않는다', () => {
    expect(isGuestRosterRow(row({ userType: null, isGuestAccount: false }))).toBe(false)
  })

  it('계정이 아직 없는 줄은 임직원일 수 없으므로 선다', () => {
    expect(
      isGuestRosterRow(
        row({ user_id: null, accountId: null, userType: null, isGuestAccount: false, master_id: 's1', master_table: 'startups' }),
      ),
    ).toBe(true)
  })
})

describe('toGuestRosterRows', () => {
  it('임직원 줄을 걸러 내고 계정값을 그대로 옮긴다', () => {
    const rows = toGuestRosterRows([
      row({ id: 'p1' }),
      row({ id: 'p2', userType: 'internal', isGuestAccount: false }),
    ])
    expect(rows.map((r) => r.participantId)).toEqual(['p1'])
    expect(rows[0]!.accountEmail).toBe('guest@example.com')
  })

  it('원장 없는 줄의 연결 원장은 null이다(임직원이라 적지 않는다)', () => {
    expect(toGuestRosterRows([row({})])[0]!.source).toBeNull()
  })

  it('원장이 붙은 줄은 자격과 이름을 함께 든다', () => {
    const rows = toGuestRosterRows([
      row({ master_table: 'startups', master_id: 's1', targetName: '뉴런랩스' }),
    ])
    expect(rows[0]!.source).toEqual({ masterTable: 'startups', masterId: 's1', name: '뉴런랩스' })
  })
})

describe('buildLeftRows', () => {
  it('이미 명부에 있는 계정은 후보에서 빠진다 — 판정 키는 계정 id다', () => {
    const left = buildLeftRows(
      [candidate({ userId: 'u1' }), candidate({ userId: 'u2' })],
      [roster({ participantId: 'p1', userId: 'u1' })],
      [],
      [],
      '',
    )
    expect(left.map((r) => r.key)).toEqual(['candidate:u2'])
  })

  it('원장이 없는 명부 줄도 같은 키로 걸러진다', () => {
    const left = buildLeftRows(
      [candidate({ userId: 'u1' })],
      [roster({ userId: 'u1', source: null })],
      [],
      [],
      '',
    )
    expect(left).toEqual([])
  })

  it('이번에 올린 계정은 왼쪽에 남지 않는다', () => {
    const left = buildLeftRows([candidate({ userId: 'u2' })], [], [candidate({ userId: 'u2' })], [], '')
    expect(left).toEqual([])
  })

  it('내린 줄이 맨 위에 서고, 같은 계정이 후보로 다시 서지 않는다', () => {
    const left = buildLeftRows(
      [candidate({ userId: 'u1' })],
      [roster({ participantId: 'p1', userId: 'u1' })],
      [],
      ['p1'],
      '',
    )
    expect(left).toHaveLength(1)
    expect(left[0]).toMatchObject({ kind: 'returning', participantId: 'p1' })
  })

  it('내린 줄도 검색어에 걸린다 — 좁힌 목록에 무관한 줄이 남지 않는다', () => {
    const left = buildLeftRows([], [roster({ participantId: 'p1', accountName: '김게스트' })], [], ['p1'], '박')
    expect(left).toEqual([])
  })
})

describe('buildRightRows', () => {
  it('이번에 올린 계정이 기존 명부 위에 선다', () => {
    const right = buildRightRows(
      [candidate({ userId: 'u9' })],
      [roster({ participantId: 'p1' })],
      [],
    )
    expect(right.map((r) => r.key)).toEqual(['staged:u9', 'member:p1'])
  })

  it('내린 줄은 오른쪽에서 사라진다', () => {
    expect(buildRightRows([], [roster({ participantId: 'p1' })], ['p1'])).toEqual([])
  })
})

describe('stageAccount / dropStaged', () => {
  it('같은 계정을 두 번 올려도 한 줄이다', () => {
    const once = stageAccount([], candidate({ userId: 'u9' }))
    const twice = stageAccount(once, candidate({ userId: 'u9' }))
    expect(twice.map((c) => c.userId)).toEqual(['u9'])
  })

  it('확정이 끝난 계정은 대기 목록에서 지워져 다시 나가지 않는다', () => {
    const staged = [candidate({ userId: 'u1' }), candidate({ userId: 'u2' })]
    expect(dropStaged(staged, ['u1']).map((c) => c.userId)).toEqual(['u2'])
  })
})
