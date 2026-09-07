import { describe, expect, it } from 'vitest'
import { isTextOnlyMime, resolveMime, SUPPORTED_HINT } from './formats.ts'
import { googleExportUrl, htmlToText } from './linkRead.ts'
import {
  AI_EXTENSION_MIMES,
  AI_SUPPORTED_HINT,
  resolveAiMime,
} from '@/features/ai/aiFormats'

/**
 * 형식 판정과 링크 읽기 회귀 테스트.
 *
 * 가장 중요한 것은 **화면과 서버가 같은 목록을 본다**는 것이다. 어긋나면 화면에서는 고를 수
 * 있는데 서버가 415로 거절하거나, 읽을 수 있는 자료가 회색으로 잠긴다. 런타임이 달라 모듈을
 * 공유할 수 없으므로 두 곳에 두되 여기서 같은지 확인한다.
 */

describe('화면과 서버가 같은 형식을 본다', () => {
  it('안내 문구가 같다', () => {
    expect(SUPPORTED_HINT).toBe(AI_SUPPORTED_HINT)
  })

  it('확장자마다 같은 MIME을 고른다', () => {
    for (const ext of Object.keys(AI_EXTENSION_MIMES)) {
      const name = `자료.${ext}`
      expect(resolveMime(null, name), ext).toBe(resolveAiMime(null, name))
    }
  })

  it('지원하지 않는 형식은 양쪽 모두 거절한다', () => {
    // 구형 오피스(.xls·.doc·.ppt)는 ZIP이 아니라 다른 이진 형식이라 우리가 열지 못한다.
    for (const name of ['계획서.hwp', '재무.xls', '소개.ppt', '보고.doc', '압축.zip']) {
      expect(resolveMime(null, name), name).toBeNull()
      expect(resolveAiMime(null, name), name).toBeNull()
    }
  })

  it('오피스 3종은 우리가 열어서 읽는다', () => {
    for (const name of ['재무.xlsx', '소개.pptx', '보고.docx']) {
      const mime = resolveMime(null, name)
      expect(mime, name).not.toBeNull()
      expect(resolveAiMime(null, name), name).toBe(mime)
      // 압축을 풀어 글자로 넘기므로 문서를 눈으로 보는 형식은 아니다.
      expect(isTextOnlyMime(mime as string), name).toBe(true)
    }
  })
})

describe('resolveMime', () => {
  it('마크다운은 평문으로 보낸다(모델이 text/md를 거절한다)', () => {
    expect(resolveMime(null, 'notes.md')).toBe('text/plain')
    expect(resolveMime('text/markdown', 'notes')).toBe('text/plain')
  })

  it('확장자를 저장된 형식 값보다 우선한다', () => {
    // 브라우저가 형식을 모르면 octet-stream을 준다. 그때 이름이 답한다.
    expect(resolveMime('application/octet-stream', '사업계획서.pdf')).toBe('application/pdf')
  })

  it('형식 값에 붙은 파라미터를 떼고 읽는다', () => {
    expect(resolveMime('text/csv; charset=utf-8', '재무')).toBe('text/csv')
  })

  it('같은 것을 다르게 적은 값들을 흡수한다', () => {
    expect(resolveMime('image/jpg', '사진')).toBe('image/jpeg')
    expect(resolveMime('application/xml', '데이터')).toBe('text/xml')
  })

  it('PDF와 이미지만 눈으로 보는 형식이다', () => {
    expect(isTextOnlyMime('application/pdf')).toBe(false)
    expect(isTextOnlyMime('image/png')).toBe(false)
    expect(isTextOnlyMime('text/csv')).toBe(true)
  })
})

describe('googleExportUrl — 구글이 대신 변환한다', () => {
  it('시트는 표(CSV)로 받는다', () => {
    expect(googleExportUrl('https://docs.google.com/spreadsheets/d/ABC123/edit#gid=0')).toBe(
      'https://docs.google.com/spreadsheets/d/ABC123/export?format=csv',
    )
  })

  it('문서는 PDF로 받는다(레이아웃을 그대로 보기 위해)', () => {
    expect(googleExportUrl('https://docs.google.com/document/d/DOC9/edit')).toBe(
      'https://docs.google.com/document/d/DOC9/export?format=pdf',
    )
  })

  it('슬라이드도 PDF로 받는다', () => {
    expect(googleExportUrl('https://docs.google.com/presentation/d/P1/edit')).toBe(
      'https://docs.google.com/presentation/d/P1/export/pdf',
    )
  })

  it('구글 문서가 아니면 손대지 않는다', () => {
    expect(googleExportUrl('https://example.com/a.pdf')).toBeNull()
    expect(googleExportUrl('https://drive.google.com/file/d/X/view')).toBeNull()
    expect(googleExportUrl('not-a-url')).toBeNull()
  })
})

describe('htmlToText', () => {
  it('스크립트와 스타일은 통째로 버린다', () => {
    const text = htmlToText('<style>.a{color:red}</style><p>본문</p><script>var x=1</script>')
    expect(text).toBe('본문')
  })

  it('문단이 끝나면 줄을 바꾼다(문장이 붙지 않게)', () => {
    expect(htmlToText('<p>첫째</p><p>둘째</p>')).toBe('첫째\n둘째')
  })

  it('엔티티를 되돌린다', () => {
    expect(htmlToText('<p>A&amp;B&nbsp;C</p>')).toBe('A&B C')
  })
})
