import { describe, expect, it } from 'vitest'
import { classifySourceKind, readsByDefault, SOURCE_KIND_LABELS } from './sourceKind.ts'

/**
 * 자료 종류 판정의 회귀 테스트.
 *
 * 여기서 지키는 것은 둘 — **모르면 읽지 않는다**(낱말이 없으면 `other`)와 **약어는 낱말
 * 경계로만 잡는다**(`first`의 `ir`이 IR이 되면 아무 파일이나 상에 선다).
 *
 * 근거: docs/docs_planning/3_3_7_ai_fill_visual_read.md §4
 */
describe('classifySourceKind — 파일명이 종류를 답한다', () => {
  it('확정 서류를 좁은 종류로 먼저 잡는다', () => {
    expect(classifySourceKind('2025 감사보고서.pdf')).toBe('audit')
    expect(classifySourceKind('재무제표(손익계산서 포함).xlsx')).toBe('pnl')
    expect(classifySourceKind('FY24_Financial_Statements.pdf')).toBe('financial')
    expect(classifySourceKind('주주명부_2025.09.xlsx')).toBe('shareholders')
    expect(classifySourceKind('법인등기부등본.pdf')).toBe('registry')
    expect(classifySourceKind('ISO9001 인증서.jpg')).toBe('cert')
  })

  it('IR·사업계획서·소개서를 가른다', () => {
    expect(classifySourceKind('회사IR자료_2025.pdf')).toBe('ir')
    expect(classifySourceKind('Pitch Deck v3.pdf')).toBe('ir')
    expect(classifySourceKind('사업계획서_최종.hwpx')).toBe('plan')
    expect(classifySourceKind('BP_2025.pptx')).toBe('plan')
    expect(classifySourceKind('Company Profile.pdf')).toBe('intro')
    expect(classifySourceKind('회사소개서.pptx')).toBe('intro')
  })

  it('약어는 낱말 경계로만 잡는다 — first·dir은 IR이 아니다', () => {
    expect(classifySourceKind('first_draft.pdf')).toBe('other')
    expect(classifySourceKind('dir_listing.txt')).toBe('other')
    expect(classifySourceKind('IR.pdf')).toBe('ir')
    expect(classifySourceKind('2025-IR-deck.pdf')).toBe('ir')
  })

  it('걸리는 낱말이 없으면 기타이고 읽지 않는다', () => {
    expect(classifySourceKind('회의록_0901.docx')).toBe('other')
    expect(classifySourceKind('사진1.png')).toBe('other')
    expect(readsByDefault('other')).toBe(false)
    expect(readsByDefault('financial')).toBe(true)
  })

  it('링크는 주소의 마지막 마디로 본다', () => {
    expect(classifySourceKind('https://drive.google.com/file/d/abc/재무제표.pdf')).toBe('financial')
    expect(classifySourceKind('https://docs.google.com/spreadsheets/d/abc/edit')).toBe('other')
    expect(classifySourceKind('https://')).toBe('other')
  })

  it('모든 종류에 화면 이름이 있다', () => {
    for (const kind of ['audit', 'pnl', 'financial', 'ir', 'other'] as const) {
      expect(SOURCE_KIND_LABELS[kind]).toBeTruthy()
    }
  })
})
