import { describe, expect, it } from 'vitest'
import { readRequest, verifyAgainstAttachment, type AttachmentFacts, type ExtractRequest } from './request.ts'
import { PARSER_VERSION } from '../_shared/docParse/types.ts'

/**
 * 신뢰 경계 회귀 테스트.
 *
 * 파일 분석을 브라우저에 맡긴 대가로, 서버가 받는 것은 **말**이다. 여기서 지키는 것은 그
 * 말이 원장 행과 어긋날 때 반드시 막힌다는 것 하나다 — 막히지 않으면 조작된 요청이 다른
 * 파일의 글자를 그 첨부의 이름으로 심고, 그 글자는 다음 담당자의 초안이 된다.
 *
 * 근거: docs/docs_planning/3_3_5_startup_ai_fill.md §16.2·§16.11
 */

const base = {
  startupId: 'S1',
  attachmentId: 'A1',
  source: 'file',
  parserVersion: PARSER_VERSION,
  fileName: '사업계획서.xlsx',
  mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  byteSize: 1024,
  result: { status: 'ready', body: { chunks: [] } },
}

const ok = (raw: unknown): ExtractRequest => {
  const out = readRequest(raw)
  if ('error' in out) throw new Error(out.error.message)
  return out
}

const facts: AttachmentFacts = {
  targetType: 'startup',
  targetId: 'S1',
  fileName: '사업계획서.xlsx',
  kind: 'FILE',
  url: null,
  byteSize: 1024,
  mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
}

describe('요청 읽기', () => {
  it('파서 버전이 다르면 409로 돌려보낸다(옛 규칙의 글자를 새 규칙인 척 저장하지 않는다)', () => {
    const out = readRequest({ ...base, parserVersion: '0' })
    expect('error' in out && out.error.status).toBe(409)
    expect('error' in out && out.error.code).toBe('stale_parser')
  })

  it('종류가 없으면 거절한다', () => {
    expect('error' in readRequest({ ...base, source: 'x' })).toBe(true)
    expect('error' in readRequest(null)).toBe(true)
  })

  it('저장 대상이 없는 파일은 결과가 함께 와야 한다(등록 모드는 브라우저가 연다)', () => {
    expect('error' in readRequest({ ...base, attachmentId: null, result: null })).toBe(true)
  })

  it('저장 대상이 있으면 결과를 받지 않는다(서버가 스토리지에서 직접 연다)', () => {
    expect('error' in readRequest({ ...base, result: null })).toBe(false)
  })

  it('링크는 주소 모양을 본다(사설 스킴을 여기서 이미 끊는다)', () => {
    expect('error' in readRequest({ ...base, source: 'link', result: null, url: 'file:///etc/passwd' })).toBe(true)
    expect('error' in readRequest({ ...base, source: 'link', result: null, url: 'https://a.com/x' })).toBe(false)
  })

  it('실패 결과는 사유를 사람이 읽을 문구로 남긴다', () => {
    const out = ok({ ...base, result: { status: 'failed', reason: '' } })
    expect(out.result).toEqual({ status: 'failed', reason: '자료를 분석하지 못했습니다.' })
  })
})

describe('원장 행과 대조', () => {
  it('같으면 통과한다', () => {
    expect(verifyAgainstAttachment(ok(base), facts, 'S1')).toBeNull()
  })

  it('다른 기업의 자료는 막는다', () => {
    expect(verifyAgainstAttachment(ok(base), { ...facts, targetId: 'S2' }, 'S1')).toContain('이 기업의 자료가 아닙니다')
    expect(verifyAgainstAttachment(ok(base), { ...facts, targetType: 'program' }, 'S1')).not.toBeNull()
  })

  it('이름·형식·크기가 어긋나면 막는다(같은 이름의 다른 파일을 심지 못하게)', () => {
    expect(verifyAgainstAttachment(ok(base), { ...facts, fileName: '다른.xlsx' }, 'S1')).toContain('파일 이름')
    expect(verifyAgainstAttachment(ok(base), { ...facts, mime: 'application/pdf' }, 'S1')).toContain('파일 형식')
    expect(verifyAgainstAttachment(ok(base), { ...facts, byteSize: 2048 }, 'S1')).toContain('파일 크기')
  })

  it('원장에 크기가 없는 옛 행은 크기로 대조하지 않는다(없는 것과 어긋난 것은 다르다)', () => {
    expect(verifyAgainstAttachment(ok(base), { ...facts, byteSize: null }, 'S1')).toBeNull()
  })

  it('종류가 어긋나면 막는다(링크 자리에 파일 결과를 넣지 못한다)', () => {
    expect(verifyAgainstAttachment(ok(base), { ...facts, kind: 'LINK', url: 'https://a.com' }, 'S1')).toContain(
      '자료의 종류',
    )
  })

  it('링크는 주소가 원장과 같아야 한다', () => {
    const req = ok({ ...base, source: 'link', result: null, url: 'https://a.com/x' })
    const linkFacts: AttachmentFacts = { ...facts, kind: 'LINK', url: 'https://a.com/x', byteSize: null }
    expect(verifyAgainstAttachment(req, linkFacts, 'S1')).toBeNull()
    expect(verifyAgainstAttachment(req, { ...linkFacts, url: 'https://b.com/y' }, 'S1')).toContain('주소가 원장과')
  })
})
