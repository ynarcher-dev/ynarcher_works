import { describe, expect, it } from 'vitest'
import { programFlowGroups, programStatusOptions } from './config'

describe('M&A 프로젝트 상태 수명주기', () => {
  it('M&A에만 중단 상태를 연다', () => {
    expect(programStatusOptions(false, true)).toEqual([
      'DRAFT',
      'OPERATING',
      'FINISHED',
      'SUSPENDED',
      'CANCELLED',
    ])
    expect(programStatusOptions(false)).toEqual([
      'DRAFT',
      'OPERATING',
      'FINISHED',
      'CANCELLED',
    ])
  })

  it('중단과 취소를 운영 단계의 나란한 이탈 상태로 둔다', () => {
    expect(programFlowGroups(false, true)).toEqual([
      {
        stage: 'OPERATION',
        label: '운영 단계',
        statuses: ['DRAFT', 'OPERATING', 'FINISHED'],
        exits: ['SUSPENDED', 'CANCELLED'],
      },
    ])
  })
})
