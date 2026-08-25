import { describe, expect, it } from 'vitest'
import {
  isChecklistDone, isQuickMemoEmpty, sortQuickMemos, type QuickMemo, type QuickMemoItem,
} from './quickMemoStore'

function memo(overrides: Partial<QuickMemo> = {}): QuickMemo {
  return {
    id: overrides.id ?? 'm1',
    type: 'CHECKLIST',
    title: '',
    content: '',
    items: [],
    pinned: false,
    createdAt: '2026-08-25T00:00:00.000Z',
    updatedAt: '2026-08-25T00:00:00.000Z',
    ...overrides,
  }
}

function item(content: string, completed: boolean): QuickMemoItem {
  return { id: `${content}-${String(completed)}`, content, completed }
}

describe('isQuickMemoEmpty', () => {
  it('제목·내용·항목이 모두 비면 빈 메모다', () => {
    expect(isQuickMemoEmpty(memo({ items: [item('', false)] }))).toBe(true)
  })

  it('공백만 있는 제목은 비어 있는 것으로 본다', () => {
    expect(isQuickMemoEmpty(memo({ title: '   ' }))).toBe(true)
  })

  it('항목 하나라도 내용이 있으면 빈 메모가 아니다', () => {
    expect(isQuickMemoEmpty(memo({ items: [item('', false), item('보고서', false)] }))).toBe(false)
  })
})

describe('isChecklistDone', () => {
  it('내용 있는 항목이 모두 완료면 끝난 목록이다', () => {
    expect(isChecklistDone(memo({ items: [item('a', true), item('b', true)] }))).toBe(true)
  })

  it('작성 중 남긴 빈 줄은 세지 않는다', () => {
    // 빈 줄을 세면 다 처리한 목록이 영영 진행중으로 남아 대시보드에서 사라지지 않는다.
    expect(isChecklistDone(memo({ items: [item('a', true), item('', false)] }))).toBe(true)
  })

  it('항목이 하나도 없으면 끝난 것이 아니다', () => {
    expect(isChecklistDone(memo({ items: [] }))).toBe(false)
  })

  it('하나라도 남아 있으면 끝난 것이 아니다', () => {
    expect(isChecklistDone(memo({ items: [item('a', true), item('b', false)] }))).toBe(false)
  })

  it('메모(NOTE)는 완료 판정 대상이 아니다', () => {
    expect(isChecklistDone(memo({ type: 'NOTE', content: '본문' }))).toBe(false)
  })
})

describe('sortQuickMemos', () => {
  it('고정을 먼저, 그다음 최근 수정 순으로 세운다', () => {
    const rows = [
      memo({ id: 'old', updatedAt: '2026-08-20T00:00:00.000Z' }),
      memo({ id: 'pinned-old', pinned: true, updatedAt: '2026-08-01T00:00:00.000Z' }),
      memo({ id: 'new', updatedAt: '2026-08-24T00:00:00.000Z' }),
    ]
    expect(sortQuickMemos(rows).map((row) => row.id)).toEqual(['pinned-old', 'new', 'old'])
  })

  it('원본 배열을 건드리지 않는다(서버 캐시를 제자리에서 뒤집지 않기 위해)', () => {
    const rows = [memo({ id: 'a' }), memo({ id: 'b', pinned: true })]
    sortQuickMemos(rows)
    expect(rows.map((row) => row.id)).toEqual(['a', 'b'])
  })
})
