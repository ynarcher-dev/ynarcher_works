import { describe, expect, it } from 'vitest'
import { computePhases, validateStaffing } from '@/features/program/programManagerCoverage'
import type { OrgVersion } from '@/features/management/orgHooks'

/**
 * 종료일 미정(2026-09-08)의 회귀 테스트.
 *
 * 여기서 지키는 것은 셋이다 — 시작일만 있어도 단계가 서고, 만료 없는 조직 버전의 단계는
 * 끝이 열린 채로 서며, 열린 단계에서는 담당자 구간의 끝을 위쪽 경계로 검사하지 않는다.
 * 셋 중 하나만 되돌아가도 "종료일을 모르는 사업은 담당자를 배정할 수 없다"로 되돌아간다.
 */
const version = (id: string, from: string, to: string | null): OrgVersion =>
  ({ id, label: id, effective_from: from, effective_to: to }) as OrgVersion

const manager = (start: string, end: string) => ({
  user_id: 'u1',
  org_version_id: 'v1',
  department_id: 'd1',
  role: 'PM' as const,
  allocation_rate: 100,
  start_date: start,
  end_date: end,
})

const department = {
  org_version_id: 'v1',
  department_id: 'd1',
  kind: 'MAIN' as const,
  collaboration_ratio: 100,
}

describe('computePhases', () => {
  it('시작일이 없으면 단계를 내지 않는다', () => {
    expect(computePhases([version('v1', '2026-01-01', null)], null, '2026-12-31')).toEqual([])
  })

  it('종료일이 없고 조직 버전도 열려 있으면 끝이 null인 단계가 선다', () => {
    const phases = computePhases([version('v1', '2026-01-01', null)], '2026-03-01', null)
    expect(phases).toHaveLength(1)
    expect(phases[0]!.start).toBe('2026-03-01')
    expect(phases[0]!.end).toBeNull()
  })

  it('종료일이 없어도 조직 버전의 만료가 단계의 끝을 정한다', () => {
    const phases = computePhases(
      [version('v1', '2026-01-01', '2026-07-01'), version('v2', '2026-07-01', null)],
      '2026-03-01',
      null,
    )
    expect(phases.map((p) => [p.start, p.end])).toEqual([
      ['2026-03-01', '2026-06-30'],
      ['2026-07-01', null],
    ])
  })

  it('두 날짜가 다 있으면 종전과 같이 교집합으로 끊는다', () => {
    const phases = computePhases(
      [version('v1', '2026-01-01', null)],
      '2026-03-01',
      '2026-09-30',
    )
    expect(phases).toEqual([
      { versionId: 'v1', label: 'v1', start: '2026-03-01', end: '2026-09-30' },
    ])
  })
})

describe('validateStaffing — 열린 단계', () => {
  const phases = computePhases([version('v1', '2026-01-01', null)], '2026-03-01', null)

  it('담당자 구간이 단계 시작 이후이기만 하면 통과한다', () => {
    expect(validateStaffing([department], [manager('2026-03-01', '2027-12-31')], phases)).toEqual({
      ok: true,
    })
  })

  it('단계 시작보다 앞선 구간은 여전히 막는다', () => {
    const res = validateStaffing([department], [manager('2026-02-01', '2026-12-31')], phases)
    expect(res.ok).toBe(false)
  })
})
