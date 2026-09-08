import { describe, expect, it } from 'vitest'
import { validateSizes, validateSources, type ResolvedSource } from './sources.ts'

/**
 * 자료 목록 판정의 회귀 테스트.
 *
 * 여기서 지키는 것은 하나 — **"하나도 없다"는 요청 전체의 사실이지 업로드 목록의 사실이
 * 아니다.** 두 판정이 한 함수에 묶여 있던 동안, 업로드 예비 검사가 보류 파일만 들고 그
 * 함수를 부르면서 **참조 자료만 고른 등록 요청을 끊었다** — 화면에는 자료 스무 건이 켜져
 * 있는데 서버는 "읽을 자료를 선택해야 합니다"로 답했다.
 *
 * 크기 판정은 갈라 두어도 그대로여야 한다. 예비 검사가 하는 일이 바로 그것이고(큰 파일을
 * 내려받기 전에 끊는다), 그것까지 함께 풀리면 예비 검사가 아무것도 막지 않게 된다.
 *
 * 근거: docs/docs_planning/3_6_1_ma_seller_quick_review.md §6.5
 */

const source = (name: string, byteSize: number): ResolvedSource => ({
  key: name,
  attachmentId: null,
  name,
  byteSize,
  storagePath: null,
  data: null,
  mime: 'application/pdf',
  url: null,
})

describe('자료 목록 판정', () => {
  it('빈 목록은 요청 전체를 볼 때만 막는다(업로드 예비 검사는 통과시킨다)', () => {
    // 참조 자료만 고른 등록 요청이 여기서 끊기던 자리다 — 보류 파일이 없다는 것이
    // 자료가 없다는 뜻은 아니다.
    expect(validateSizes([])).toBeNull()
    expect(validateSources([])?.message).toContain('읽을 자료를 선택해야 합니다')
  })

  it('자료가 있으면 두 판정이 같은 답을 낸다', () => {
    const ok = [source('IR.pdf', 1024)]
    expect(validateSizes(ok)).toBeNull()
    expect(validateSources(ok)).toBeNull()
  })

  it('크기 판정은 갈라 두어도 그대로다 — 한 건 상한을 합산보다 먼저 본다', () => {
    // 합계만 보면 "합은 되는데 한 파일이 전부"인 경우를 통과시키고, 그때는 나머지 자료가
    // 모델에 닿지 못한 채 초안만 부실해진다.
    const huge = [source('큰파일.pdf', 40 * 1024 * 1024)]
    expect(validateSizes(huge)?.code).toBe('too_large')
    expect(validateSizes(huge)?.message).toContain('한 건이 너무 큽니다')
    expect(validateSources(huge)?.code).toBe('too_large')
  })

  it('합산 상한도 그대로다', () => {
    const many = Array.from({ length: 3 }, (_, i) => source(`f${i}.pdf`, 20 * 1024 * 1024))
    expect(validateSizes(many)?.message).toContain('합이 너무 큽니다')
  })
})
