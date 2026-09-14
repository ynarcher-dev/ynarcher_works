import { describe, expect, it } from 'vitest'
import {
  guestDetailScope,
  guestDoorInput,
  guestOpenProgramCount,
} from '@/features/admin/guestParticipation'

const participation = (over: Record<string, unknown> = {}) => ({
  entity_key: 'program' as const,
  login_status: 'INVITED' as const,
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

  it('원장 분류 없이 계정의 전체 참여를 보여 준다', () => {
    const programs = [participation(), participation({ entity_key: 'fund' as const })]
    const scope = guestDetailScope({ programs, program_count: 2 })
    expect(scope.programs).toEqual(programs)
    expect(scope.heading).toBe('참여 프로젝트/FUND')
    expect(scope.note).toBeNull()
  })
})
