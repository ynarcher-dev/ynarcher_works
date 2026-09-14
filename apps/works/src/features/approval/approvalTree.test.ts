import { describe, expect, it } from 'vitest'
import { orderApprovalTree, type ApprovalDoc, type ApprovalEdge } from './approvalTree'

const doc = (id: string, createdAt: string): ApprovalDoc => ({
  id,
  title: `문서 ${id}`,
  docNo: null,
  docType: '품의서',
  status: 'APPROVED',
  amount: 1_000_000,
  createdAt,
})

const mapOf = (...docs: ApprovalDoc[]) => new Map(docs.map((d) => [d.id, d]))

describe('orderApprovalTree', () => {
  it('품의 아래 지출, 지출 아래 관련 문서를 계보 순서로 편다', () => {
    const a = doc('a', '2026-09-01T00:00:00Z')
    const b = doc('b', '2026-09-02T00:00:00Z')
    const c = doc('c', '2026-09-03T00:00:00Z')
    const edges: ApprovalEdge[] = [
      { parentId: 'a', childId: 'b', relation: 'SPEND' },
      { parentId: 'b', childId: 'c', relation: 'REF', note: '구매내역' },
    ]

    const rows = orderApprovalTree([a], edges, mapOf(a, b, c))

    expect(rows.map((r) => [r.id, r.depth, r.relation])).toEqual([
      ['a', 0, 'DIRECT'],
      ['b', 1, 'SPEND'],
      ['c', 2, 'REF'],
    ])
    expect(rows[2]?.parentId).toBe('b')
    expect(rows[2]?.note).toBe('구매내역')
  })

  it('뿌리는 기안일 내림차순이고 자식도 그 순서를 따른다', () => {
    const old = doc('old', '2026-08-01T00:00:00Z')
    const recent = doc('recent', '2026-09-10T00:00:00Z')
    const child1 = doc('c1', '2026-08-20T00:00:00Z')
    const child2 = doc('c2', '2026-08-25T00:00:00Z')
    const edges: ApprovalEdge[] = [
      { parentId: 'old', childId: 'c1', relation: 'SPEND' },
      { parentId: 'old', childId: 'c2', relation: 'SPEND' },
    ]

    const rows = orderApprovalTree([old, recent], edges, mapOf(old, recent, child1, child2))

    expect(rows.map((r) => r.id)).toEqual(['recent', 'old', 'c2', 'c1'])
  })

  it('두 경로로 닿는 문서는 먼저 닿은 자리에 한 번만 선다', () => {
    // 지출이 워크스페이스에도 직접 걸려 있고 근거 품의로도 매달린 경우 — 뿌리 쪽이 이긴다.
    const a = doc('a', '2026-09-05T00:00:00Z')
    const b = doc('b', '2026-09-01T00:00:00Z')
    const edges: ApprovalEdge[] = [{ parentId: 'a', childId: 'b', relation: 'SPEND' }]

    const rows = orderApprovalTree([a, b], edges, mapOf(a, b))

    expect(rows.map((r) => [r.id, r.depth, r.relation])).toEqual([
      ['a', 0, 'DIRECT'],
      ['b', 0, 'DIRECT'],
    ])
  })

  it('상호 참조가 되돌아와도 무한히 돌지 않는다', () => {
    const a = doc('a', '2026-09-01T00:00:00Z')
    const b = doc('b', '2026-09-02T00:00:00Z')
    const edges: ApprovalEdge[] = [
      { parentId: 'a', childId: 'b', relation: 'REF' },
      { parentId: 'b', childId: 'a', relation: 'REF' },
    ]

    const rows = orderApprovalTree([a], edges, mapOf(a, b))

    expect(rows.map((r) => r.id)).toEqual(['a', 'b'])
  })

  it('조회에서 빠진(열람 불가·삭제·임시저장) 문서는 가지에 세우지 않는다', () => {
    const a = doc('a', '2026-09-01T00:00:00Z')
    const edges: ApprovalEdge[] = [{ parentId: 'a', childId: 'hidden', relation: 'SPEND' }]

    const rows = orderApprovalTree([a], edges, mapOf(a))

    expect(rows.map((r) => r.id)).toEqual(['a'])
  })
})
