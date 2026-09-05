import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildParts, type BuildDeps } from './parts.ts'
import type { UploadedFile } from './filesApi.ts'
import { MAX_INLINE_BYTES, MAX_TOTAL_BYTES } from './limits.ts'
import type { ResolvedSource } from './sources.ts'
import type { LinkContent, LinkError } from './linkRead.ts'

/**
 * 자료 조립의 예산 회귀 테스트.
 *
 * 여기서 지키는 것은 하나 — **링크가 예산에 들어간다**. 링크는 가져오기 전에 크기를 알 수 없어
 * 예비 검사에서 0으로 잡히므로, 이 관문이 세지 않으면 링크 몇 건이 모델 한도를 조용히 넘긴다.
 * 그때 담당자가 보는 것은 이유 없는 "AI 작성에 실패했습니다" 한 줄뿐이라, 화면만 보고는
 * 무엇을 빼야 하는지 알 수 없다.
 *
 * 근거: docs/docs_planning/3_3_5_startup_ai_fill.md §9
 */

const MB = 1024 * 1024

function fileSource(name: string, bytes: number): ResolvedSource {
  return {
    attachmentId: null,
    name,
    byteSize: bytes,
    storagePath: null,
    data: new ArrayBuffer(bytes),
    mime: 'application/pdf',
    url: null,
  }
}

function linkSource(url: string): ResolvedSource {
  return { attachmentId: null, name: url, byteSize: 0, storagePath: null, data: null, mime: null, url }
}

/** 링크를 읽는 척한다. 넘겨받은 남은 예산을 기록해 예산이 실제로 깎이는지 본다. */
function stubLinks(replies: (LinkContent | LinkError)[]) {
  const limits: number[] = []
  let i = 0
  const fn = (_url: string, limitBytes: number) => {
    limits.push(limitBytes)
    return Promise.resolve(replies[i++] ?? { message: '준비된 응답 없음' })
  }
  return { limits, fn }
}

const asBytes = (n: number): LinkContent => ({
  mime: 'application/pdf',
  bytes: new ArrayBuffer(n),
  text: null,
  truncated: false,
})

const asText = (text: string): LinkContent => ({ mime: 'text/plain', bytes: null, text, truncated: false })

/**
 * 이 파일의 테스트는 바깥으로 나가지 않는다.
 *
 * 실수로 실제 Files API를 두드리면 키가 없는 환경에서는 느리게 실패하고, 있는 환경에서는
 * 조용히 성공해 버린다 — 둘 다 테스트가 무엇을 재는지 말하지 못하게 만든다.
 */
beforeEach(() => {
  vi.stubGlobal('fetch', () => {
    throw new Error('이 테스트는 네트워크를 쓰지 않는다')
  })
})
afterEach(() => vi.unstubAllGlobals())

function deps(readLink: BuildDeps['readLink']): BuildDeps {
  return {
    apiKey: 'test-key',
    signal: new AbortController().signal,
    download: () => Promise.resolve(null),
    readLink,
  }
}

describe('buildParts — 링크도 예산을 쓴다', () => {
  it('링크를 읽을 때마다 남은 예산이 줄어든다', async () => {
    const stub = stubLinks([asBytes(MB), asBytes(MB), asBytes(MB)])
    const built = await buildParts(
      [linkSource('https://a.example/1'), linkSource('https://a.example/2'), linkSource('https://a.example/3')],
      deps(stub.fn),
      [],
    )
    expect('error' in built).toBe(false)
    // 종전에는 세 번 모두 상한 전체를 넘겨받아, 다섯 건이면 합이 상한의 다섯 배까지 갔다.
    expect(stub.limits).toEqual([MAX_TOTAL_BYTES, MAX_TOTAL_BYTES - MB, MAX_TOTAL_BYTES - 2 * MB])
  })

  it('앞선 파일이 쓴 만큼을 빼고 링크에 넘긴다', async () => {
    const stub = stubLinks([asBytes(MB)])
    await buildParts([fileSource('계획서.pdf', 10 * MB), linkSource('https://a.example/1')], deps(stub.fn), [])
    expect(stub.limits).toEqual([MAX_TOTAL_BYTES - 10 * MB])
  })

  it('남은 예산을 넘겨 오면 그 링크만 버리고 사유를 남긴다', async () => {
    // 상한을 지키지 않는 응답을 일부러 준다 — 관문이 스스로 닫히는지 보는 것이 요점이다.
    // 첫 건을 글로 두는 것은 그것이 파일 합계에 끼지 않아 조립이 인라인에 머물기 때문이다
    // (바이트로 두면 Files API 왕복이 함께 걸려 무엇을 재는 테스트인지 흐려진다).
    // 한글 한 자가 3바이트라 47MB쯤을 먹고, 남은 5MB를 뒤 건이 넘긴다.
    const stub = stubLinks([asText('가'.repeat(15 * MB)), asBytes(6 * MB)])
    const built = await buildParts(
      [linkSource('https://a.example/big'), linkSource('https://a.example/small')],
      deps(stub.fn),
      [],
    )
    if ('error' in built) throw new Error('링크는 통째 실패로 만들지 않는다')
    expect(built.notices).toHaveLength(1)
    expect(built.notices[0]).toContain('https://a.example/small')
    // 버린 것은 뒤의 한 건뿐이고 앞의 자료는 그대로 간다.
    expect(built.parts).toHaveLength(1)
  })

  it('읽지 못한 링크는 실행을 멈추지 않고 사유만 남는다', async () => {
    const stub = stubLinks([{ message: '구글 문서가 비공개입니다.' }, asBytes(MB)])
    const built = await buildParts(
      [linkSource('https://docs.google.com/document/d/X/edit'), linkSource('https://a.example/2')],
      deps(stub.fn),
      [],
    )
    if ('error' in built) throw new Error('한 건이 막혔다고 전체를 멈추지 않는다')
    expect(built.notices).toEqual(['구글 문서가 비공개입니다.'])
    expect(built.parts).toHaveLength(1)
  })
})

describe('buildParts — 파일 예산', () => {
  it('링크가 먼저 먹어 합이 상한을 넘으면 거절한다', async () => {
    const stub = stubLinks([asBytes(MAX_TOTAL_BYTES - MB)])
    const built = await buildParts(
      [linkSource('https://a.example/1'), fileSource('계획서.pdf', 2 * MB)],
      deps(stub.fn),
      [],
    )
    if (!('error' in built)) throw new Error('상한을 넘으면 거절해야 한다')
    expect(built.error.code).toBe('too_large')
    expect(built.error.status).toBe(413)
  })

  it('내려받지 못한 첨부는 조용히 빠지지 않고 실패로 답한다', async () => {
    const src: ResolvedSource = { ...fileSource('계획서.pdf', MB), data: null, storagePath: 'x/y.pdf' }
    const built = await buildParts([src], deps(stubLinks([]).fn), [])
    if (!('error' in built)) throw new Error('읽지 못한 첨부는 실패다')
    expect(built.error.code).toBe('read_failed')
  })
})

describe('buildParts — 보내는 방식은 합계가 정한다', () => {
  it('인라인 한도 안이면 요청에 실어 보낸다(아무것도 올리지 않는다)', async () => {
    const uploaded: UploadedFile[] = []
    const built = await buildParts([fileSource('a.pdf', 8), fileSource('b.pdf', 8)], deps(stubLinks([]).fn), uploaded)
    if ('error' in built) throw new Error('실패할 이유가 없다')
    expect(uploaded).toEqual([])
    expect(built.parts.every((p) => Object.hasOwn(p as object, 'inlineData'))).toBe(true)
  })

  it('인라인 한도를 넘으면 올린 뒤 주소로 가리킨다', async () => {
    // Files API 왕복을 흉내 낸다 — 시작(주소 헤더) · 본체 · 상태 조회 순.
    const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/upload/v1beta/files')) {
        return new Response('{}', { headers: { 'x-goog-upload-url': 'https://upload.example/session' } })
      }
      if (url.startsWith('https://upload.example/')) {
        return Response.json({ file: { name: 'files/abc', uri: 'https://files/abc', mimeType: 'application/pdf' } })
      }
      if (init?.method === 'DELETE') return new Response(null, { status: 200 })
      return Response.json({ state: 'ACTIVE' })
    })
    vi.stubGlobal('fetch', fetchMock)
    const uploaded: UploadedFile[] = []
    const built = await buildParts([fileSource('큰계획서.pdf', MAX_INLINE_BYTES + MB)], deps(stubLinks([]).fn), uploaded)
    if ('error' in built) throw new Error('실패할 이유가 없다')
    expect(built.parts).toEqual([{ fileData: { mimeType: 'application/pdf', fileUri: 'https://files/abc' } }])
    // 그릇은 호출자가 쥔다 — 여기 담기지 않으면 지울 목록이 없어 올린 자료가 남는다.
    expect(uploaded).toEqual([{ name: 'files/abc', uri: 'https://files/abc', mime: 'application/pdf' }])
  })

  it('올리다 시간이 초과돼도 그때까지 올린 것은 그릇에 남는다', async () => {
    // 첫 건은 올라가고 둘째 건에서 취소된다 — 예외로 빠져나가는 경로가 지울 목록을 잃지 않는지 본다.
    let uploads = 0
    vi.stubGlobal('fetch', async (input: string | URL) => {
      const url = String(input)
      if (url.includes('/upload/v1beta/files')) {
        if (++uploads > 1) throw new DOMException('aborted', 'AbortError')
        return new Response('{}', { headers: { 'x-goog-upload-url': 'https://upload.example/session' } })
      }
      if (url.startsWith('https://upload.example/')) {
        return Response.json({ file: { name: 'files/one', uri: 'https://files/one', mimeType: 'application/pdf' } })
      }
      return Response.json({ state: 'ACTIVE' })
    })
    const uploaded: UploadedFile[] = []
    await expect(
      buildParts(
        [fileSource('하나.pdf', MAX_INLINE_BYTES), fileSource('둘.pdf', MB)],
        deps(stubLinks([]).fn),
        uploaded,
      ),
    ).rejects.toThrow()
    expect(uploaded).toEqual([{ name: 'files/one', uri: 'https://files/one', mime: 'application/pdf' }])
  })
})
