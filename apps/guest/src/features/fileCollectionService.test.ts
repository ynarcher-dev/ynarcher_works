import { describe, expect, it } from 'vitest'
import {
  DEFAULT_CONTENT_TYPE,
  MAX_UPLOAD_BYTES,
  addComment,
  commitPendingFile,
  downloadFile,
  removeFile,
  submitResponse,
  uploadFiles,
  uploadOneFile,
  validateUpload,
  type FileCollectionGateway,
  type FileEndpointResult,
  type UploadCandidate,
} from '@/features/fileCollectionService'

/**
 * 파일받기 GUEST 서비스의 회귀.
 *
 * 여기서 지키는 것은 화면 모양이 아니라 **순서와 거절**이다 — 서명 → 업로드 → 확정이 그
 * 순서대로 일어나는가, 중간에 끊겼을 때 확정을 보내지 않는가, 맥락이 갈린 뒤의 작업이
 * 새 세션으로 이어지지 않는가. 구현을 복제해 다시 적는 단언은 두지 않는다.
 */

interface Recorded {
  kind: 'invoke' | 'upload' | 'rpc' | 'deliver'
  body?: Record<string, unknown>
  fn?: string
  args?: Record<string, unknown>
  path?: string
  url?: string
  fileName?: string
}

interface FakeOptions {
  signResult?: (call: number) => FileEndpointResult<unknown>
  commitResult?: (call: number) => FileEndpointResult<unknown>
  downloadResult?: FileEndpointResult<unknown>
  uploadError?: (call: number) => unknown
  rpcResult?: { data?: unknown; error?: unknown }
  /** 몇 번째 `isStale` 호출부터 '맥락이 갈렸다'고 답할지. */
  staleFrom?: number
}

function fakeGateway(options: FakeOptions = {}) {
  const calls: Recorded[] = []
  let signCount = 0
  let commitCount = 0
  let uploadCount = 0
  let staleChecks = 0

  const gw: FileCollectionGateway = {
    async invokeFile<T>(body: Record<string, unknown>): Promise<FileEndpointResult<T>> {
      calls.push({ kind: 'invoke', body })
      if (body.action === 'sign') {
        signCount += 1
        const result = options.signResult?.(signCount) ?? {
          ok: true,
          data: {
            fileId: `file-${signCount}`,
            bucket: 'file-collection',
            path: `m/a/r/${signCount}`,
            token: `token-${signCount}`,
            signedUrl: `https://example.test/${signCount}`,
          },
          error: null,
        }
        return result as FileEndpointResult<T>
      }
      if (body.action === 'commit') {
        commitCount += 1
        const result = options.commitResult?.(commitCount) ?? {
          ok: true,
          data: { fileId: body.fileId },
          error: null,
        }
        return result as FileEndpointResult<T>
      }
      return (options.downloadResult ?? {
        ok: true,
        data: { url: 'https://example.test/signed', fileName: '보고서.pdf' },
        error: null,
      }) as FileEndpointResult<T>
    },
    async uploadToSignedUrl(input) {
      uploadCount += 1
      calls.push({ kind: 'upload', path: input.path, body: { contentType: input.contentType } })
      return { error: options.uploadError?.(uploadCount) ?? null }
    },
    async rpc<T>(fn: string, args: Record<string, unknown>) {
      calls.push({ kind: 'rpc', fn, args })
      return {
        data: (options.rpcResult?.data ?? null) as T | null,
        error: options.rpcResult?.error ?? null,
      }
    },
    isStale: () => {
      staleChecks += 1
      return options.staleFrom !== undefined && staleChecks >= options.staleFrom
    },
    deliver: (url, fileName) => calls.push({ kind: 'deliver', url, fileName }),
  }

  return { gw, calls, kinds: () => calls.map((c) => c.kind) }
}

const file = (name: string, size = 1024, type = 'application/pdf'): UploadCandidate => ({
  name,
  size,
  type,
})

describe('업로드 전 검증', () => {
  it('빈 파일과 100MB 초과 파일은 보내지 않는다', () => {
    expect(validateUpload(file('빈.txt', 0))).toMatchObject({ ok: false })
    expect(validateUpload(file('큰.zip', MAX_UPLOAD_BYTES + 1))).toMatchObject({ ok: false })
  })

  it('이름이 255자를 넘으면 거절한다', () => {
    expect(validateUpload(file(`${'가'.repeat(256)}.pdf`))).toMatchObject({ ok: false })
  })

  it('형식을 모르는 파일은 octet-stream으로 보낸다', () => {
    expect(validateUpload(file('무형식', 10, ''))).toEqual({
      ok: true,
      contentType: DEFAULT_CONTENT_TYPE,
    })
  })
})

describe('파일 한 개 올리기', () => {
  it('서명 → 업로드 → 확정 순서로 진행하고 서명 본문에 실제 파일 값을 싣는다', async () => {
    const { gw, calls, kinds } = fakeGateway()
    const result = await uploadOneFile(gw, {
      responseId: 'resp-1',
      file: file('사업계획서.pdf', 2048),
    })

    expect(result).toEqual({ ok: true, fileName: '사업계획서.pdf', fileId: 'file-1' })
    expect(kinds()).toEqual(['invoke', 'upload', 'invoke'])
    expect(calls[0]?.body).toEqual({
      action: 'sign',
      responseId: 'resp-1',
      fileName: '사업계획서.pdf',
      contentType: 'application/pdf',
      byteSize: 2048,
    })
    expect(calls[1]?.path).toBe('m/a/r/1')
    expect(calls[2]?.body).toEqual({ action: 'commit', fileId: 'file-1' })
  })

  it('업로드가 실패하면 확정을 보내지 않고 남은 PENDING 줄을 알린다', async () => {
    const { gw, kinds } = fakeGateway({ uploadError: () => ({ message: 'network' }) })
    const result = await uploadOneFile(gw, { responseId: 'resp-1', file: file('a.pdf') })

    expect(result).toMatchObject({ ok: false, reason: 'upload_failed', fileId: 'file-1' })
    expect(kinds()).toEqual(['invoke', 'upload'])
  })

  it('서명이 실패하면 업로드도 확정도 하지 않고 서버가 준 fileId를 살린다', async () => {
    const { gw, kinds } = fakeGateway({
      signResult: () => ({
        ok: false,
        data: null,
        error: { error: 'sign_failed', fileId: 'pending-9' },
      }),
    })
    const result = await uploadOneFile(gw, { responseId: 'resp-1', file: file('a.pdf') })

    expect(result).toMatchObject({ ok: false, reason: 'sign_failed', fileId: 'pending-9' })
    expect(kinds()).toEqual(['invoke'])
  })

  it('주소를 받는 사이에 맥락이 갈리면 실물을 올리지도 않는다', async () => {
    // 검사는 1) 시작 전 2) 업로드 직전 3) 확정 직전. 두 번째부터 갈린 것으로 답하게 한다.
    const { gw, kinds } = fakeGateway({ staleFrom: 2 })
    const result = await uploadOneFile(gw, { responseId: 'resp-1', file: file('a.pdf') })

    // 저장소에도 원장에도 앞사람 파일을 더 얹지 않는다. 서명이 만든 PENDING 줄만 돌려준다.
    expect(result).toMatchObject({ ok: false, reason: 'context_changed', fileId: 'file-1' })
    expect(kinds()).toEqual(['invoke'])
  })

  it('업로드 뒤 계정·맥락이 갈리면 확정하지 않는다', async () => {
    const { gw, kinds } = fakeGateway({ staleFrom: 3 })
    const result = await uploadOneFile(gw, { responseId: 'resp-1', file: file('a.pdf') })

    expect(result).toMatchObject({ ok: false, reason: 'context_changed', fileId: 'file-1' })
    expect(kinds()).toEqual(['invoke', 'upload'])
  })

  it('서명·업로드·확정이 약속을 깨고 던져도 그 단계의 실패로만 접는다', async () => {
    const thrown = (stage: 'sign' | 'upload' | 'commit') => {
      const boom = () => {
        throw new Error('boom')
      }
      return stage === 'sign'
        ? { signResult: boom as () => FileEndpointResult<unknown> }
        : stage === 'upload'
          ? { uploadError: boom as () => unknown }
          : { commitResult: boom as () => FileEndpointResult<unknown> }
    }

    const sign = fakeGateway(thrown('sign'))
    // 서명 호출이 통째로 끊긴 경우다. 서버가 줄을 만들었는지 알 수 없으므로 fileId를 짓지 않는다.
    await expect(
      uploadOneFile(sign.gw, { responseId: 'resp-1', file: file('a.pdf') }),
    ).resolves.toEqual({
      ok: false,
      fileName: 'a.pdf',
      reason: 'sign_failed',
      message: '업로드 주소를 발급받지 못했습니다.',
    })
    expect(sign.kinds()).toEqual(['invoke'])

    const upload = fakeGateway(thrown('upload'))
    await expect(
      uploadOneFile(upload.gw, { responseId: 'resp-1', file: file('a.pdf') }),
    ).resolves.toMatchObject({ ok: false, reason: 'upload_failed', fileId: 'file-1' })
    expect(upload.kinds()).toEqual(['invoke', 'upload'])

    const commit = fakeGateway(thrown('commit'))
    await expect(
      uploadOneFile(commit.gw, { responseId: 'resp-1', file: file('a.pdf') }),
    ).resolves.toMatchObject({ ok: false, reason: 'commit_failed', fileId: 'file-1' })
  })

  it('확정이 거절되면 성공으로 접지 않는다', async () => {
    const { gw } = fakeGateway({
      commitResult: () => ({ ok: false, data: null, error: { error: 'commit_denied' } }),
    })
    const result = await uploadOneFile(gw, { responseId: 'resp-1', file: file('a.pdf') })

    expect(result).toMatchObject({ ok: false, reason: 'commit_failed', fileId: 'file-1' })
  })
})

describe('여러 파일 올리기', () => {
  it('파일마다 결과를 따로 돌려주고 하나의 실패를 다른 성공에 묶지 않는다', async () => {
    const { gw } = fakeGateway({ uploadError: (n) => (n === 2 ? { message: 'boom' } : null) })
    const results = await uploadFiles(gw, {
      responseId: 'resp-1',
      files: [file('1.pdf'), file('2.pdf'), file('3.pdf')],
    })

    expect(results.map((r) => r.ok)).toEqual([true, false, true])
    expect(results[1]).toMatchObject({ fileName: '2.pdf', reason: 'upload_failed' })
  })

  it('도중에 맥락이 갈리면 남은 파일은 시작하지 않는다', async () => {
    // 첫 파일은 네 번의 검사(묶음 차례·시작·업로드 전·확정 전)를 모두 통과하고,
    // 두 번째 파일 차례에서 갈린다.
    const { gw, calls } = fakeGateway({ staleFrom: 5 })
    const results = await uploadFiles(gw, {
      responseId: 'resp-1',
      files: [file('1.pdf'), file('2.pdf')],
    })

    expect(results[0]?.ok).toBe(true)
    expect(results[1]).toMatchObject({ ok: false, reason: 'context_changed' })
    // 두 번째 파일은 서명조차 나가지 않는다.
    expect(calls.filter((c) => c.body?.action === 'sign')).toHaveLength(1)
  })

  it('한 파일에서 예상 못 한 예외가 나도 앞선 결과를 잃지 않고 다음 파일로 간다', async () => {
    // 두 번째 파일의 서명에서 배선이 통째로 던진다(결과 객체조차 오지 않는 경우).
    const { gw, calls } = fakeGateway({
      signResult: ((call: number) => {
        if (call === 2) throw new Error('boom')
        return undefined as unknown as FileEndpointResult<unknown>
      }) as (call: number) => FileEndpointResult<unknown>,
    })
    const results = await uploadFiles(gw, {
      responseId: 'resp-1',
      files: [file('1.pdf'), file('2.pdf'), file('3.pdf')],
    })

    expect(results.map((r) => r.ok)).toEqual([true, false, true])
    expect(results[1]).toMatchObject({ fileName: '2.pdf', ok: false })
    // 세 번째 파일은 시작되고 확정까지 간다 — 실패가 묶음을 끊지 않는다.
    expect(calls.filter((c) => c.body?.action === 'sign')).toHaveLength(3)
    expect(calls.filter((c) => c.body?.action === 'commit')).toHaveLength(2)
  })
})

describe('올라가다 만 파일 재확인', () => {
  it('확정만 다시 보낸다(재서명·재업로드로 같은 파일을 두 줄 만들지 않는다)', async () => {
    const { gw, calls, kinds } = fakeGateway()
    const result = await commitPendingFile(gw, 'file-7')

    expect(result.ok).toBe(true)
    expect(kinds()).toEqual(['invoke'])
    expect(calls[0]?.body).toEqual({ action: 'commit', fileId: 'file-7' })
  })
})

describe('RPC 계약', () => {
  it('제출은 문항 하나의 응답 id만 보낸다', async () => {
    const { gw, calls } = fakeGateway({ rpcResult: { data: 'SUBMITTED' } })
    const status = await submitResponse(gw, 'resp-42')

    expect(status).toBe('SUBMITTED')
    expect(calls[0]).toMatchObject({
      kind: 'rpc',
      fn: 'file_collection_submit',
      args: { p_response_id: 'resp-42' },
    })
  })

  it('제출이 거절되면 서버가 말한 이유를 그대로 올린다', async () => {
    const { gw } = fakeGateway({ rpcResult: { error: { message: '제출할 파일이 없습니다.' } } })
    await expect(submitResponse(gw, 'resp-42')).rejects.toThrow('제출할 파일이 없습니다.')
  })

  it('코멘트와 파일 내리기는 각자의 함수·인자로 나간다', async () => {
    const { gw, calls } = fakeGateway({ rpcResult: { data: 'comment-1' } })
    await addComment(gw, { responseId: 'resp-1', body: '설명 추가합니다.' })
    await removeFile(gw, 'file-3')

    expect(calls[0]).toMatchObject({
      fn: 'file_collection_add_comment',
      args: { p_response_id: 'resp-1', p_body: '설명 추가합니다.' },
    })
    expect(calls[1]).toMatchObject({
      fn: 'file_collection_remove_file',
      args: { p_file_id: 'file-3' },
    })
  })
})

describe('내려받기', () => {
  it('Edge가 준 주소로만 내려받는다(직접 서명하지 않는다)', async () => {
    const { gw, calls } = fakeGateway()
    await downloadFile(gw, 'file-5')

    expect(calls[0]?.body).toEqual({ action: 'download', fileId: 'file-5' })
    expect(calls[1]).toMatchObject({
      kind: 'deliver',
      url: 'https://example.test/signed',
      fileName: '보고서.pdf',
    })
  })

  it('거절되면 내려받기를 시작하지 않는다', async () => {
    const { gw, kinds } = fakeGateway({
      downloadResult: { ok: false, data: null, error: { error: 'forbidden' } },
    })
    await expect(downloadFile(gw, 'file-5')).rejects.toThrow()
    expect(kinds()).toEqual(['invoke'])
  })

  it('주소를 받는 사이에 맥락이 갈리면 받아 둔 주소를 넘기지 않는다', async () => {
    // 검사는 주소를 받은 뒤 한 번뿐이므로 첫 검사부터 갈린 것으로 답하게 한다.
    const { gw, kinds } = fakeGateway({ staleFrom: 1 })
    await expect(downloadFile(gw, 'file-5')).resolves.toEqual({ delivered: false })

    // 다음 사람의 화면에서 앞사람이 고른 파일이 저장되기 시작하는 일을 만들지 않는다.
    expect(kinds()).toEqual(['invoke'])
  })
})
