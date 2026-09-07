import { describe, expect, it } from 'vitest'
import { buildPrompt } from './prompts.ts'

describe('AI 작성 프롬프트 숫자 표기', () => {
  it('문자열에는 천 단위 쉼표를, JSON 숫자 필드에는 순수 숫자를 지시한다', () => {
    const prompt = buildPrompt(['summary', 'revenue'], '테스트 기업')

    expect(prompt).toContain('문자열 항목 안의 숫자는 세 자리마다 쉼표를 넣습니다')
    expect(prompt).toContain('1,000명 · 12,345원')
    expect(prompt).toContain('JSON 숫자 필드는 쉼표 없는 숫자로 씁니다')
  })
})
