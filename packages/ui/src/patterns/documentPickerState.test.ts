import { describe, expect, it } from 'vitest'
import {
  documentPickerView,
  resolvePickedItem,
  type DocumentPickerItem,
} from './documentPickerState'

const item = (id: string, title = `문서 ${id}`): DocumentPickerItem => ({
  id,
  docNo: `YNA-${id}`,
  title,
})

describe('documentPickerView', () => {
  it('실패는 남아 있는 목록보다 앞선다 — 낡은 후보를 고르게 두지 않는다', () => {
    expect(
      documentPickerView({ loading: false, error: true, itemCount: 5, narrowed: false }),
    ).toBe('error')
    expect(documentPickerView({ loading: true, error: true, itemCount: 0, narrowed: true })).toBe(
      'error',
    )
  })

  it('조회 중이라도 줄이 서 있으면 목록을 유지한다(페이지 이동 때 표가 깜빡이지 않게)', () => {
    expect(
      documentPickerView({ loading: true, error: false, itemCount: 20, narrowed: false }),
    ).toBe('list')
  })

  it('첫 조회 중에는 로딩', () => {
    expect(
      documentPickerView({ loading: true, error: false, itemCount: 0, narrowed: false }),
    ).toBe('loading')
  })

  it('비었을 때 좁히고 있었는지로 검색 결과 없음과 후보 없음을 가른다', () => {
    expect(
      documentPickerView({ loading: false, error: false, itemCount: 0, narrowed: true }),
    ).toBe('empty-narrowed')
    expect(
      documentPickerView({ loading: false, error: false, itemCount: 0, narrowed: false }),
    ).toBe('empty')
  })
})

describe('resolvePickedItem', () => {
  it('고르지 않았으면 아무것도 세우지 않는다', () => {
    expect(resolvePickedItem(null, [item('a')], item('a'))).toBeNull()
  })

  it('목록에 있으면 목록의 값이 이긴다(제목이 바뀌어도 지금 값을 보인다)', () => {
    const fresh = item('a', '고친 제목')
    expect(resolvePickedItem('a', [fresh], item('a', '옛 제목'))).toBe(fresh)
  })

  it('검색·페이지로 목록 밖으로 나가도 기억해 둔 값으로 요약이 남는다', () => {
    const remembered = item('a')
    expect(resolvePickedItem('a', [item('b'), item('c')], remembered)).toBe(remembered)
  })

  it('기억해 둔 값이 다른 문서면 그것을 고른 것처럼 적지 않는다', () => {
    expect(resolvePickedItem('a', [item('b')], item('z'))).toBeNull()
  })
})
