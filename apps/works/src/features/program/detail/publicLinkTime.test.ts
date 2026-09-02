import { describe, expect, it } from 'vitest'
import { isoToLocal, localToIso } from '@/features/program/detail/publicLinkTime'

/**
 * 공개 링크 기간 표기 왕복 검증.
 *
 * 절대 시각을 못박지 않고 **왕복이 보존되는가**를 묻는다 — 실행 환경의 표준시가 무엇이든
 * 담당자가 넣은 시각이 그대로 되읽혀야 한다는 것이 이 변환의 유일한 약속이기 때문이다.
 * 특정 오프셋을 기대하는 테스트는 CI 표준시가 바뀌는 날 거짓으로 깨진다.
 */
describe('공개 기간 표기 왕복', () => {
  const samples = [
    '2026-09-01T00:00',
    '2026-09-30T23:59',
    '2026-01-01T09:00',
    '2026-12-31T18:30',
    // 서머타임을 쓰는 지역에서 실행될 때 경계에 걸리는 날짜들.
    '2026-03-08T02:30',
    '2026-11-01T01:30',
  ]

  it.each(samples)('%s 는 저장했다 되읽어도 같은 시각이다', (local) => {
    const iso = localToIso(local)
    expect(iso).not.toBeNull()
    expect(isoToLocal(iso)).toBe(local)
  })
})

describe('빈 값은 기간 미지정을 뜻한다', () => {
  it('빈 문자열은 null — 모듈 기간을 상속하라는 신호다', () => {
    expect(localToIso('')).toBeNull()
  })

  it('null ISO는 빈 입력으로 되읽힌다', () => {
    expect(isoToLocal(null)).toBe('')
  })

  it('해석할 수 없는 값은 양방향 모두 빈 값으로 떨어진다 — 잘못된 시각을 저장하지 않는다', () => {
    expect(localToIso('아무말')).toBeNull()
    expect(isoToLocal('아무말')).toBe('')
  })
})

describe('ISO는 UTC로 저장된다', () => {
  it('오프셋이 붙은 입력도 같은 순간을 가리키는 UTC 문자열이 된다', () => {
    // 원장이 timestamptz이므로 저장 표기는 언제나 Z여야 한다.
    expect(localToIso('2026-09-30T23:59:59.999+09:00')).toBe('2026-09-30T14:59:59.999Z')
  })
})
