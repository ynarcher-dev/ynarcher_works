import { describe, expect, it } from 'vitest'
import {
  CATEGORY_FILTER_OPTIONS,
  CATEGORY_OPTIONS,
  isCompactCategory,
  resolveCategory,
} from '@/features/networks/config'

describe('NETWORKS 스타트업 구분', () => {
  it('등록·업로드와 목록 필터에서 선택할 수 있다', () => {
    expect(CATEGORY_OPTIONS).toContainEqual({ key: 'startup', label: '스타트업' })
    expect(CATEGORY_FILTER_OPTIONS).toContainEqual({ value: 'startup', label: '스타트업' })
    expect(resolveCategory('startup')).toBe('startup')
    expect(resolveCategory('스타트업')).toBe('startup')
  })

  it('조직이 아니라 사람 분류이므로 전체 프로필을 사용한다', () => {
    expect(isCompactCategory('startup')).toBe(false)
  })
})
