import { describe, expect, it } from 'vitest'
import {
  WORKSPACE_PICK_ALL,
  filterWorkspaceCandidates,
  pageOfWorkspaceCandidates,
  type WorkspaceCandidate,
} from '@/features/approval/workspacePicker'

const ROWS: WorkspaceCandidate[] = [
  { targetType: 'program', targetId: 'p1', label: '와이앤아처 액셀러레이팅', code: 'AC-2026-01' },
  { targetType: 'ma_program', targetId: 'm1', label: '제조 매각 건', code: null },
  { targetType: 'fund', targetId: 'f1', label: '1호 투자조합', code: 'FUND-01' },
]

describe('워크스페이스 후보 좁히기', () => {
  it('좁히지 않으면 전부 선다', () => {
    expect(filterWorkspaceCandidates(ROWS, { keyword: '', kind: WORKSPACE_PICK_ALL })).toHaveLength(3)
  })

  it('공백만 적은 검색어는 좁힘이 아니다', () => {
    expect(filterWorkspaceCandidates(ROWS, { keyword: '   ', kind: WORKSPACE_PICK_ALL })).toHaveLength(3)
  })

  it('종류로 좁힌다', () => {
    const rows = filterWorkspaceCandidates(ROWS, { keyword: '', kind: 'fund' })
    expect(rows.map((r) => r.targetId)).toEqual(['f1'])
  })

  it('이름으로도 코드로도 찾는다 — 코드는 대소문자를 접는다', () => {
    expect(filterWorkspaceCandidates(ROWS, { keyword: '매각', kind: WORKSPACE_PICK_ALL })).toHaveLength(1)
    expect(filterWorkspaceCandidates(ROWS, { keyword: 'ac-2026', kind: WORKSPACE_PICK_ALL })).toHaveLength(1)
  })

  it('코드가 없는 행이 검색에서 터지지 않는다', () => {
    expect(filterWorkspaceCandidates(ROWS, { keyword: 'FUND', kind: WORKSPACE_PICK_ALL })).toHaveLength(1)
  })

  it('검색어와 종류는 함께 걸린다', () => {
    expect(filterWorkspaceCandidates(ROWS, { keyword: '조합', kind: 'program' })).toHaveLength(0)
  })
})

describe('워크스페이스 후보 페이지', () => {
  it('페이지 크기만큼 자른다', () => {
    expect(pageOfWorkspaceCandidates(ROWS, 0, 2).map((r) => r.targetId)).toEqual(['p1', 'm1'])
    expect(pageOfWorkspaceCandidates(ROWS, 1, 2).map((r) => r.targetId)).toEqual(['f1'])
  })

  it('범위를 벗어난 페이지는 빈 배열이다', () => {
    expect(pageOfWorkspaceCandidates(ROWS, 5, 2)).toEqual([])
  })
})
