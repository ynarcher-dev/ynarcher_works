import { describe, expect, it } from 'vitest'
import { toggleAxisValues } from '@/lib/filterAxis'

describe('toggleAxisValues', () => {
  it('묶음 값이 비어 있으면 모두 선택한다', () => {
    expect(toggleAxisValues([], ['NOT_SELECTED', 'CANCELLED'])).toEqual([
      'NOT_SELECTED',
      'CANCELLED',
    ])
  })

  it('묶음 중 일부만 선택돼 있어도 빠진 값을 더해 묶음 전체를 선택한다', () => {
    expect(toggleAxisValues(['NOT_SELECTED'], ['NOT_SELECTED', 'CANCELLED'])).toEqual([
      'NOT_SELECTED',
      'CANCELLED',
    ])
  })

  it('묶음 전체가 선택돼 있으면 다른 필터는 보존하고 묶음만 해제한다', () => {
    expect(
      toggleAxisValues(
        ['DRAFT', 'NOT_SELECTED', 'CANCELLED'],
        ['NOT_SELECTED', 'CANCELLED'],
      ),
    ).toEqual(['DRAFT'])
  })
})
