import { describe, expect, it } from 'vitest'
import { inBox, isMyTurn, matchesKeyword, progressBucket, type ApprovalListRow } from './model'

const ME = 'me'
const OTHER = 'other'

function row(partial: Partial<ApprovalListRow> = {}): ApprovalListRow {
  return {
    id: 'doc-1',
    title: '2026년 8월 4주차 지출의 건',
    doc_no: '지결-260826-0001',
    form_type: 'GENERAL',
    status: 'PENDING',
    drafter_id: OTHER,
    department_id: null,
    amount: null,
    created_at: '2026-08-26T09:00:00Z',
    completed_at: null,
    form: { name: '지출결의서' },
    approval_lines: [],
    approval_recipients: [],
    approval_reads: [],
    ...partial,
  }
}

describe('isMyTurn', () => {
  it('순번상 첫 PENDING 결재선이 나이면 내 차례다', () => {
    const lines = [
      { approver_id: OTHER, step_order: 1, decision: 'APPROVED' as const },
      { approver_id: ME, step_order: 2, decision: 'PENDING' as const },
    ]
    expect(isMyTurn(lines, ME)).toBe(true)
  })

  it('앞 단계가 아직 PENDING이면 내 차례가 아니다', () => {
    const lines = [
      { approver_id: OTHER, step_order: 1, decision: 'PENDING' as const },
      { approver_id: ME, step_order: 2, decision: 'PENDING' as const },
    ]
    expect(isMyTurn(lines, ME)).toBe(false)
  })

  it('앞 단계가 반려됐으면 누구의 차례도 아니다', () => {
    const lines = [
      { approver_id: OTHER, step_order: 1, decision: 'REJECTED' as const },
      { approver_id: ME, step_order: 2, decision: 'PENDING' as const },
    ]
    expect(isMyTurn(lines, ME)).toBe(false)
  })

  it('step_order가 뒤섞여 와도 순번으로 판정한다', () => {
    const lines = [
      { approver_id: ME, step_order: 2, decision: 'PENDING' as const },
      { approver_id: OTHER, step_order: 1, decision: 'APPROVED' as const },
    ]
    expect(isMyTurn(lines, ME)).toBe(true)
  })
})

describe('progressBucket', () => {
  it('내 차례인 진행 문서는 대기(waiting)다', () => {
    const r = row({
      approval_lines: [{ approver_id: ME, step_order: 1, decision: 'PENDING' }],
    })
    expect(progressBucket(r, ME)).toBe('waiting')
  })

  it('결재선에 있지만 차례가 아니면 예정(upcoming)이다', () => {
    const r = row({
      approval_lines: [
        { approver_id: OTHER, step_order: 1, decision: 'PENDING' },
        { approver_id: ME, step_order: 2, decision: 'PENDING' },
      ],
    })
    expect(progressBucket(r, ME)).toBe('upcoming')
  })

  it('내가 기안해 흐르는 중이면 진행(ongoing)이다', () => {
    const r = row({
      drafter_id: ME,
      approval_lines: [{ approver_id: OTHER, step_order: 1, decision: 'PENDING' }],
    })
    expect(progressBucket(r, ME)).toBe('ongoing')
  })

  it('완료됐는데 아직 안 읽었으면 확인(confirm), 읽었으면 해당 없음이다', () => {
    const done = row({
      status: 'APPROVED',
      completed_at: '2026-08-26T10:00:00Z',
      approval_recipients: [{ user_id: ME }],
    })
    expect(progressBucket(done, ME)).toBe('confirm')
    expect(progressBucket({ ...done, approval_reads: [{ user_id: ME }] }, ME)).toBe(null)
  })

  it('나와 무관한 문서는 어느 타일에도 들지 않는다', () => {
    expect(progressBucket(row(), ME)).toBe(null)
  })
})

describe('inBox', () => {
  it('내 문서함 전체는 기안·결재·참조 어느 자리든 담는다', () => {
    expect(inBox(row({ drafter_id: ME }), 'mine-all', ME, null)).toBe(true)
    expect(
      inBox(
        row({ approval_lines: [{ approver_id: ME, step_order: 1, decision: 'PENDING' }] }),
        'mine-all',
        ME,
        null,
      ),
    ).toBe(true)
    expect(inBox(row({ approval_recipients: [{ user_id: ME }] }), 'mine-cc', ME, null)).toBe(true)
    expect(inBox(row(), 'mine-all', ME, null)).toBe(false)
  })

  it('부서 문서함은 같은 부서의 상신 문서만 담고 DRAFT는 제외한다', () => {
    const dept = 'dept-1'
    expect(inBox(row({ department_id: dept }), 'dept-all', ME, dept)).toBe(true)
    expect(inBox(row({ department_id: dept, status: 'DRAFT' }), 'dept-all', ME, dept)).toBe(false)
    expect(inBox(row({ department_id: 'dept-2' }), 'dept-all', ME, dept)).toBe(false)
    expect(inBox(row({ department_id: dept }), 'dept-all', ME, null)).toBe(false)
  })

  it('반려함은 나와 관련된 반려 문서만 담는다', () => {
    expect(inBox(row({ drafter_id: ME, status: 'REJECTED' }), 'mine-rejected', ME, null)).toBe(true)
    expect(inBox(row({ status: 'REJECTED' }), 'mine-rejected', ME, null)).toBe(false)
    expect(inBox(row({ drafter_id: ME }), 'mine-rejected', ME, null)).toBe(false)
  })
})

describe('matchesKeyword', () => {
  it('제목·문서 번호·문서 종류·기안자 이름을 함께 훑는다', () => {
    const r = row()
    expect(matchesKeyword(r, '지출의 건', '김지연')).toBe(true)
    expect(matchesKeyword(r, '지결-2608', '김지연')).toBe(true)
    expect(matchesKeyword(r, '지출결의서', '김지연')).toBe(true)
    expect(matchesKeyword(r, '김지연', '김지연')).toBe(true)
    expect(matchesKeyword(r, '휴가', '김지연')).toBe(false)
    expect(matchesKeyword(r, '  ', '김지연')).toBe(true)
  })
})
