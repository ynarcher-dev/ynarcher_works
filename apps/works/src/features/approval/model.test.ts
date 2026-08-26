import { describe, expect, it } from 'vitest'
import {
  countByProgress,
  inBox,
  isLastPending,
  isMyTurn,
  matchesKeyword,
  progressBucket,
  type ApprovalListRow,
} from './model'

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

  it('합의는 병렬이라 결재 순서를 기다리지 않는다', () => {
    const lines = [
      { approver_id: OTHER, step_order: 1, decision: 'PENDING' as const, kind: 'APPROVAL' as const },
      { approver_id: ME, step_order: 1, decision: 'PENDING' as const, kind: 'AGREEMENT' as const },
    ]
    expect(isMyTurn(lines, ME)).toBe(true)
  })

  it('재무합의도 같은 병렬 규칙을 따른다', () => {
    const lines = [
      { approver_id: OTHER, step_order: 1, decision: 'PENDING' as const, kind: 'APPROVAL' as const },
      {
        approver_id: ME,
        step_order: 1,
        decision: 'PENDING' as const,
        kind: 'FINANCE_AGREEMENT' as const,
      },
    ]
    expect(isMyTurn(lines, ME)).toBe(true)
  })

  it('이미 처리한 합의는 다시 내 차례가 아니다', () => {
    const lines = [
      { approver_id: ME, step_order: 1, decision: 'APPROVED' as const, kind: 'AGREEMENT' as const },
      { approver_id: OTHER, step_order: 1, decision: 'PENDING' as const, kind: 'APPROVAL' as const },
    ]
    expect(isMyTurn(lines, ME)).toBe(false)
  })

  it('어느 행이든 반려됐으면 합의자에게도 차례가 없다', () => {
    const lines = [
      { approver_id: OTHER, step_order: 1, decision: 'REJECTED' as const, kind: 'APPROVAL' as const },
      { approver_id: ME, step_order: 1, decision: 'PENDING' as const, kind: 'AGREEMENT' as const },
    ]
    expect(isMyTurn(lines, ME)).toBe(false)
  })

  it('구분이 없는 구 데이터는 결재로 본다', () => {
    const lines = [
      { approver_id: OTHER, step_order: 1, decision: 'PENDING' as const },
      { approver_id: ME, step_order: 2, decision: 'PENDING' as const },
    ]
    expect(isMyTurn(lines, ME)).toBe(false)
  })
})

describe('isLastPending', () => {
  it('구분에 상관없이 나 말고 미처리가 없으면 마지막 한 표다', () => {
    const lines = [
      { id: 'l1', approver_id: ME, step_order: 1, decision: 'PENDING' as const, kind: 'APPROVAL' as const },
      { id: 'l2', approver_id: OTHER, step_order: 1, decision: 'APPROVED' as const, kind: 'AGREEMENT' as const },
    ]
    expect(isLastPending(lines, 'l1')).toBe(true)
  })

  it('합의가 아직 남아 있으면 결재자가 마지막이 아니다', () => {
    const lines = [
      { id: 'l1', approver_id: ME, step_order: 2, decision: 'PENDING' as const, kind: 'APPROVAL' as const },
      { id: 'l2', approver_id: OTHER, step_order: 1, decision: 'PENDING' as const, kind: 'AGREEMENT' as const },
    ]
    expect(isLastPending(lines, 'l1')).toBe(false)
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

  it('내 임시저장은 draft, 남의 임시저장은 어디에도 들지 않는다', () => {
    const mine = row({ status: 'DRAFT', drafter_id: ME })
    expect(progressBucket(mine, ME)).toBe('draft')
    expect(progressBucket(row({ status: 'DRAFT', drafter_id: OTHER }), ME)).toBe(null)
  })

  it('임시저장은 결재선이 이미 지정돼 있어도 대기·예정으로 새지 않는다', () => {
    // 상신 전이라 아직 아무의 차례도 아니다 — 결재선을 미리 짜 두었다는 이유로
    // 결재자의 '대기'에 뜨면 처리할 수 없는 문서가 할 일 목록에 선다.
    const r = row({
      status: 'DRAFT',
      drafter_id: OTHER,
      approval_lines: [{ approver_id: ME, step_order: 1, decision: 'PENDING' }],
    })
    expect(progressBucket(r, ME)).toBe(null)
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

describe('countByProgress', () => {
  it('all은 나머지 넷의 합이고, 무관한 문서는 어디에도 세지 않는다', () => {
    const rows = [
      row({ id: 'a', approval_lines: [{ approver_id: ME, step_order: 1, decision: 'PENDING' }] }),
      row({
        id: 'b',
        approval_lines: [
          { approver_id: OTHER, step_order: 1, decision: 'PENDING' },
          { approver_id: ME, step_order: 2, decision: 'PENDING' },
        ],
      }),
      row({
        id: 'c',
        drafter_id: ME,
        approval_lines: [{ approver_id: OTHER, step_order: 1, decision: 'PENDING' }],
      }),
      // 나와 무관한 문서(부서만 같아 목록에는 보이는 것) — 어느 칸에도 들지 않는다.
      row({ id: 'd' }),
    ]
    expect(countByProgress(rows, ME)).toEqual({
      all: 3,
      draft: 0,
      waiting: 1,
      upcoming: 1,
      ongoing: 1,
      confirm: 0,
    })
  })

  it('로그인 정보가 아직 없으면 전부 0이다', () => {
    const rows = [
      row({ approval_lines: [{ approver_id: ME, step_order: 1, decision: 'PENDING' }] }),
    ]
    expect(countByProgress(rows, null)).toEqual({
      all: 0,
      draft: 0,
      waiting: 0,
      upcoming: 0,
      ongoing: 0,
      confirm: 0,
    })
  })
})
