import { describe, expect, it } from 'vitest'
import { contextKindLabel } from '@/auth/guestStore'
import { fixedNavOf, overviewLabelOf } from '@/config/navigation'

describe('GUEST 프로젝트/FUND 명칭', () => {
  it('맥락 종류를 현재 메뉴 용어로 표시한다', () => {
    expect(contextKindLabel('program')).toBe('프로젝트')
    expect(contextKindLabel('ma_program')).toBe('M&A 프로젝트')
    expect(contextKindLabel('fund')).toBe('FUND')
  })

  it('소개 메뉴를 맥락별 명칭으로 표시한다', () => {
    expect(overviewLabelOf('program')).toBe('프로젝트 개요')
    expect(overviewLabelOf('ma_program')).toBe('M&A 프로젝트 개요')
    expect(overviewLabelOf('fund')).toBe('조합 개요')
  })

  it('구 세션은 프로젝트 고정 메뉴로 안전하게 폴백한다', () => {
    expect(fixedNavOf(null)[0].label).toBe('프로젝트 개요')
  })
})

describe('GUEST 일정안내 철회(2026-09-13)', () => {
  it('어느 맥락에서도 일정안내 메뉴를 세우지 않는다', () => {
    for (const key of ['program', 'ma_program', 'fund', null]) {
      const paths = fixedNavOf(key).map((item) => item.path)
      expect(paths).not.toContain('/schedule')
      expect(paths).toEqual(['/overview', '/announcements', '/qna'])
    }
  })
})
