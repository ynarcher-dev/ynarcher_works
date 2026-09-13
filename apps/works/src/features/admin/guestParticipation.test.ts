import { describe, expect, it } from 'vitest'
import {
  guestDetailScope,
  guestDoorInput,
  guestOpenProgramCount,
  hasGuestListFacet,
} from '@/features/admin/guestParticipation'

const participation = (over: Record<string, unknown> = {}) => ({
  entity_key: 'program' as const,
  login_status: 'INVITED' as const,
  master_table: null,
  program_status: 'RUNNING',
  access_ends_at: null,
  ...over,
})

describe('GUEST 계정 참여 표시', () => {
  it('원장 인격이 없어도 실제 참여 줄이면 로그인 대상이다', () => {
    expect(guestDoorInput(participation()).hasTarget).toBe(true)
    expect(guestOpenProgramCount({ is_active: true, programs: [participation()] })).toBe(1)
  })

  it('계정이 정지되면 사업 문이 열려 있어도 분자는 0이다', () => {
    expect(guestOpenProgramCount({ is_active: false, programs: [participation()] })).toBe(0)
  })

  it('인격 칸과 FUND 칸의 근거를 섞지 않는다', () => {
    const account = {
      identities: [{ master_table: 'startups' as const }],
      programs: [participation({ entity_key: 'fund' as const })],
    }
    expect(hasGuestListFacet(account, 'startups')).toBe(true)
    expect(hasGuestListFacet(account, 'fund')).toBe(true)
    expect(hasGuestListFacet(account, 'networks')).toBe(false)
  })

  it('인격 Y를 누르면 원장 미연결 참여도 포함해 계정의 전체 참여를 보여 준다', () => {
    const programs = [participation(), participation({ entity_key: 'fund' as const })]
    const scope = guestDetailScope({ programs, program_count: 2 }, 'startups', '스타트업')
    expect(scope.programs).toEqual(programs)
    expect(scope.heading).toBe('계정 참여 프로젝트/FUND')
    expect(scope.note).toContain('스타트업')
  })

  it('FUND Y를 누르면 실제 조합 참여만 보여 준다', () => {
    const fund = participation({ entity_key: 'fund' as const })
    const scope = guestDetailScope(
      { programs: [participation(), fund], program_count: 2 },
      'fund',
      'FUND',
    )
    expect(scope.programs).toEqual([fund])
    expect(scope.heading).toBe('참여 FUND')
    expect(scope.hidden).toBe(0)
  })
})
