import { describe, expect, it } from 'vitest'
import {
  budgetSourcePlan,
  budgetSourceViewOptions,
  formIdsMatchingKeyword,
} from '@/features/approval/budgetSourceQuery'

const FORMS = [
  { id: 'f1', name: '지출 품의서' },
  { id: 'f2', name: '사업 품의서 (하이웍스 복원)' },
]

const base = {
  formIds: ['f1', 'f2'],
  formFilterId: '',
  keyword: '',
  keywordFormIds: [],
  drafterIds: [],
  page: 0,
  pageSize: 20,
}

describe('budgetSourcePlan', () => {
  it('페이지 구간은 0-base로 계산한다 — 51번째 이후가 잘리던 자리다', () => {
    expect(budgetSourcePlan(base)).toMatchObject({ from: 0, to: 19 })
    expect(budgetSourcePlan({ ...base, page: 2 })).toMatchObject({ from: 40, to: 59 })
    expect(budgetSourcePlan({ ...base, page: 5, pageSize: 10 })).toMatchObject({
      from: 50,
      to: 59,
    })
  })

  it('검색어가 없으면 or 조건을 만들지 않는다', () => {
    expect(budgetSourcePlan(base).orExpr).toBeNull()
  })

  it('검색어는 제목·문서 번호와, 이름으로 풀어 온 종류·기안자에 함께 건다', () => {
    expect(
      budgetSourcePlan({
        ...base,
        keyword: '출장',
        keywordFormIds: ['f2'],
        drafterIds: ['u1', 'u2'],
      }).orExpr,
    ).toBe('title.ilike.%출장%,doc_no.ilike.%출장%,form_id.in.(f2),drafter_id.in.(u1,u2)')
  })

  it('걸리는 종류·기안자가 없으면 그 항을 넣지 않는다(빈 목록 표현이 파서를 깨뜨린다)', () => {
    expect(budgetSourcePlan({ ...base, keyword: '출장' }).orExpr).toBe(
      'title.ilike.%출장%,doc_no.ilike.%출장%',
    )
  })

  it("'보기' 필터는 후보를 좁히기만 한다", () => {
    expect(budgetSourcePlan({ ...base, formFilterId: 'f2' }).formIds).toEqual(['f2'])
  })

  it('울타리 밖 양식으로 좁히려 하면 무시한다 — 필터가 후보 정책을 넓히지 못한다', () => {
    expect(budgetSourcePlan({ ...base, formFilterId: 'other' }).formIds).toEqual(['f1', 'f2'])
  })
})

describe('formIdsMatchingKeyword', () => {
  it('복원 접미어를 뗀 표시 이름으로 맞춘다(화면에 보이는 이름으로 찾는다)', () => {
    expect(formIdsMatchingKeyword(FORMS, '사업')).toEqual(['f2'])
    expect(formIdsMatchingKeyword(FORMS, '하이웍스')).toEqual([])
  })

  it('검색어가 없으면 아무 양식도 걸지 않는다', () => {
    expect(formIdsMatchingKeyword(FORMS, '   ')).toEqual([])
  })
})

describe('budgetSourceViewOptions', () => {
  it('고를 것이 하나뿐이면 보기 필터를 세우지 않는다', () => {
    expect(budgetSourceViewOptions([])).toBeNull()
    expect(budgetSourceViewOptions([{ id: 'f1', name: '지출 품의서' }])).toBeNull()
  })

  it('둘 이상이면 전체와 각 종류를 준다', () => {
    expect(budgetSourceViewOptions(FORMS)).toEqual([
      { value: '', label: '전체 종류' },
      { value: 'f1', label: '지출 품의서' },
      { value: 'f2', label: '사업 품의서' },
    ])
  })
})
