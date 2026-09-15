import { describe, expect, it } from 'vitest'
import {
  isGuestRosterRow,
  markAlreadyAdded,
  rosterAccountIds,
  toGuestRosterRows,
  type GuestRosterRow,
} from '@/features/program/guestRoster'
import type { GuestAccountCandidate, ParticipantRow } from '@/features/program/participantHooks'

/**
 * GUEST 계정 명부의 판정. 지키는 것은 다섯이다.
 *
 *  · 원장 없는 게스트 계정이 명부에 선다(종전에는 `임직원`으로 불리며 걸러졌다).
 *  · 실제 내부 임직원만 걸러진다.
 *  · 명부 줄은 **원장 식별 관계(`source`)를 옮기지 않는다**(2026-09-14 독립 계정 정책, 3_9_3).
 *    걷은 것은 식별 관계뿐이고, 연락처처럼 표에 서는 값의 출처는 그대로다.
 *  · '이미 담김'은 **계정 id**로 판정한다 — 원장 id로 보면 원장 없는 계정을 판정할 수 없다.
 *  · 이미 담긴 계정은 **목록에서 사라지지 않고** 표시만 달린다(사라지면 계정을 또 만들러 간다).
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
    affiliation: '주식회사 후보',
    isActive: true,
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
    ...over,
  }
}

describe('isGuestRosterRow', () => {
  it('원장이 없어도 게스트 계정이면 명부에 선다', () => {
    expect(isGuestRosterRow(row({ master_table: null, userType: 'temporary_guest' }))).toBe(true)
  })

  it('원장 키가 남은 줄도 계정 유형으로 판정한다 — 정상 상태가 아니라 레거시 입력이다', () => {
    // 3_9_3 이후 GUEST 참여 줄에 원장 키가 붙는 정상 경로는 없다 — 계정을 사업에 잇는 창구가
    // 비운 채 만들고, 정리 마이그레이션이 옛 값을 지우며 재발을 막는다. 전환 중 남은 줄이나
    // 비정상 입력을 방어하는 케이스이며, 판정 축이 `master_table`이 아니라 계정 유형임을 고정한다.
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

  it('줄의 모양에 원장 식별 관계가 없다 — 표에 서는 값은 그대로다', () => {
    // `accountPhone`은 계정 프로필이 아니라 사업 원장의 현재 연락처이며(`ParticipantRow.phone`),
    // 이번에 걷은 것은 `source`(자격·원장 id·원장 이름)뿐이다.
    expect(toGuestRosterRows([row({})])[0]).toEqual({
      participantId: 'p1',
      userId: 'u1',
      accountName: '김게스트',
      accountEmail: 'guest@example.com',
      accountPhone: '01000000000',
    })
  })

  it('옛 줄에 원장 식별 관계가 남아 있어도 옮기지 않는다(3_9_3 독립 계정)', () => {
    const rows = toGuestRosterRows([
      row({ master_table: 'startups', master_id: 's1', targetName: '뉴런랩스' }),
    ])
    expect(rows[0]).not.toHaveProperty('source')
    // 원장 이름(`targetName`)도 따라오지 않는다 — 식별 관계와 함께 걷혔다.
    expect(Object.values(rows[0]!)).not.toContain('뉴런랩스')
  })
})

describe('rosterAccountIds', () => {
  it('명부가 든 계정 id만 모은다', () => {
    const ids = rosterAccountIds([
      roster({ participantId: 'p1', userId: 'u1' }),
      roster({ participantId: 'p2', userId: 'u2' }),
    ])
    expect([...ids].sort()).toEqual(['u1', 'u2'])
  })

  it('계정이 아직 없는 옛 줄은 어느 계정과도 겹치지 않으므로 빠진다', () => {
    expect(rosterAccountIds([roster({ userId: null })]).size).toBe(0)
  })
})

describe('markAlreadyAdded', () => {
  it("이미 명부에 있는 계정에만 '이미 담김'이 붙는다 — 판정 키는 계정 id다", () => {
    const rows = markAlreadyAdded(
      [candidate({ userId: 'u1' }), candidate({ userId: 'u2' })],
      [roster({ participantId: 'p1', userId: 'u1' })],
    )
    expect(rows.map((r) => [r.userId, r.alreadyAdded])).toEqual([
      ['u1', true],
      ['u2', false],
    ])
  })

  it('원장이 없는 명부 줄도 같은 키로 판정된다', () => {
    const rows = markAlreadyAdded([candidate({ userId: 'u1' })], [roster({ userId: 'u1' })])
    expect(rows[0]!.alreadyAdded).toBe(true)
  })

  it('이미 담긴 계정을 목록에서 지우지 않는다 — 사라지면 계정을 하나 더 만들러 간다', () => {
    const rows = markAlreadyAdded(
      [candidate({ userId: 'u1' })],
      [roster({ participantId: 'p1', userId: 'u1' })],
    )
    expect(rows).toHaveLength(1)
  })

  it('서버가 보낸 값을 그대로 들고 간다(화면에서 다시 거르지 않는다)', () => {
    const rows = markAlreadyAdded([candidate({ userId: 'u9', affiliation: '뉴런랩스' })], [])
    expect(rows[0]).toMatchObject({ userId: 'u9', affiliation: '뉴런랩스', alreadyAdded: false })
  })
})
