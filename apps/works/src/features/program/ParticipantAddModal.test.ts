import { describe, expect, it } from 'vitest'
import { canPickAccount } from '@/features/program/ParticipantAddModal'
import type { GuestAccountPickRow } from '@/features/program/guestRoster'

/**
 * `GUEST 계정 추가` 창의 고르기 판정. 지키는 것은 셋이다.
 *
 *  · **명부를 읽기 전에는 아무것도 고를 수 없다.** 조회 중·조회 실패를 빈 명부로 접으면
 *    `이미 담김`이 전부 false가 되어 이미 담긴 계정이 고를 수 있는 줄로 선다.
 *  · 이미 담긴 계정은 고를 수 없다.
 *  · **정지된 계정도 고를 수 없다.** 서버 창구(`add_program_guest_accounts`)가 담기 전에
 *    `users.is_active`를 요구하고 아니면 `ACCOUNT_NOT_AVAILABLE`로 그 줄을 거절한다 —
 *    화면이 고를 수 있게 두면 담당자는 보내고 난 뒤에야 실패를 본다.
 */

function pickRow(over: Partial<GuestAccountPickRow> = {}): GuestAccountPickRow {
  return {
    userId: 'u9',
    name: '박후보',
    email: 'cand@example.com',
    affiliation: '주식회사 후보',
    isActive: true,
    alreadyAdded: false,
    ...over,
  }
}

describe('canPickAccount', () => {
  it('명부를 읽은 뒤의 살아 있는 미담김 계정만 고를 수 있다', () => {
    expect(canPickAccount(pickRow(), true)).toBe(true)
  })

  it('명부를 아직 모르면 고를 수 없다 — 조회 중·실패를 빈 명부로 접지 않는다', () => {
    expect(canPickAccount(pickRow(), false)).toBe(false)
  })

  it('명부를 모르는 동안에는 담긴 적 없어 보이는 계정도 고를 수 없다', () => {
    expect(canPickAccount(pickRow({ alreadyAdded: false }), false)).toBe(false)
  })

  it('이미 담긴 계정은 고를 수 없다', () => {
    expect(canPickAccount(pickRow({ alreadyAdded: true }), true)).toBe(false)
  })

  it('정지된 계정은 고를 수 없다 — 서버가 is_active를 요구한다', () => {
    expect(canPickAccount(pickRow({ isActive: false }), true)).toBe(false)
  })

  it('정지되고 이미 담긴 계정도 고를 수 없다', () => {
    expect(canPickAccount(pickRow({ isActive: false, alreadyAdded: true }), true)).toBe(false)
  })
})
