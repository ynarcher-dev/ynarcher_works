import { describe, expect, it } from 'vitest'
import { effectiveLinkWindow, kstDay } from '@/features/program/detail/publicLinkWindow'

/**
 * 서버 게이트(`supabase/functions/_shared/publicModuleLinkGate.test.ts`)의 '모듈 기간 상속'
 * 절과 **같은 사례를 같은 값으로** 못박는다. 두 벌을 두는 이상 어긋나는 날이 오는데, 그때
 * 어긋났다는 사실을 배포 뒤가 아니라 여기서 알아야 한다.
 */
describe('모듈 기간 상속', () => {
  it('링크에 기간이 없으면 모듈 기간을 KST 하루의 시작·끝으로 읽는다', () => {
    const w = effectiveLinkWindow({
      linkOpenAt: null,
      linkCloseAt: null,
      moduleStartDate: '2026-09-01',
      moduleEndDate: '2026-09-30',
    })
    expect(w.openAt).toBe('2026-09-01T00:00:00+09:00')
    expect(w.closeAt).toBe('2026-09-30T23:59:59.999+09:00')
    expect(w.openInherited).toBe(true)
    expect(w.closeInherited).toBe(true)
  })

  it('링크에 적은 기간이 모듈 기간을 이기고, 그 경계는 상속이 아니다', () => {
    const w = effectiveLinkWindow({
      linkOpenAt: '2026-09-10T00:00:00Z',
      linkCloseAt: '2026-09-20T00:00:00Z',
      moduleStartDate: '2026-09-01',
      moduleEndDate: '2026-09-30',
    })
    expect(w.openAt).toBe('2026-09-10T00:00:00Z')
    expect(w.closeAt).toBe('2026-09-20T00:00:00Z')
    expect(w.openInherited).toBe(false)
    expect(w.closeInherited).toBe(false)
  })

  it('한쪽만 적으면 나머지 한쪽만 상속한다 — 두 경계는 서로를 전제하지 않는다', () => {
    const w = effectiveLinkWindow({
      linkOpenAt: null,
      linkCloseAt: '2026-09-20T00:00:00Z',
      moduleStartDate: '2026-09-01',
      moduleEndDate: '2026-09-30',
    })
    expect(w.openInherited).toBe(true)
    expect(w.closeInherited).toBe(false)
    expect(w.closeAt).toBe('2026-09-20T00:00:00Z')
  })

  it('날짜 형식이 아닌 세팅값은 상속하지 않는다(빈 문자열·자유 입력 방어)', () => {
    const w = effectiveLinkWindow({
      linkOpenAt: null,
      linkCloseAt: null,
      moduleStartDate: '',
      moduleEndDate: '미정',
    })
    expect(w.openAt).toBeNull()
    expect(w.closeAt).toBeNull()
    expect(w.closeInherited).toBe(false)
  })

  it('모듈 기간이 없으면 정말로 무기한이다', () => {
    const w = effectiveLinkWindow({ linkOpenAt: null, linkCloseAt: null })
    expect(w.openAt).toBeNull()
    expect(w.closeAt).toBeNull()
  })

  it('kstDay는 하루의 시작과 끝을 오프셋과 함께 답한다', () => {
    expect(kstDay('2026-01-01', 'start')).toBe('2026-01-01T00:00:00+09:00')
    expect(kstDay('2026-01-01', 'end')).toBe('2026-01-01T23:59:59.999+09:00')
  })
})
