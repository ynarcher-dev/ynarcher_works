import { describe, expect, it } from 'vitest'
import { createFileCollectionHandler, type FileCollectionDeps } from './handler.ts'
import { BUCKET } from './validation.ts'

/**
 * '파일받기' 파일 입출구의 핸들러 회귀 테스트.
 *
 * 핸들러가 배선을 주입받으므로 실제 판정 순서(인증 → 모양 검증 → 호출자 토큰 질의 →
 * 로그 → 서명)를 그대로 지나게 하고, 각 자리에서 대역이 무엇을 받았는지로 계약을 고정한다.
 *
 * > [!NOTE]
 * > 여기 대역은 **RLS를 흉내 내지 않는다.** "다른 게스트에게는 빈 결과가 온다"는 것은 이
 * > 테스트가 증명하는 사실이 아니라 DB가 그렇게 답한다고 가정한 입력이며, 그 가정 자체의
 * > 검증은 pgTAP(`supabase/tests/file_collection_isolation_test.sql`)이 가진다. 이 파일이
 * > 고정하는 것은 "그런 답이 왔을 때 핸들러가 무엇을 하지 않는가"뿐이다.
 */

const FILE_ID = '11111111-1111-4111-8111-111111111111'
const RESPONSE_ID = '22222222-2222-4222-8222-222222222222'
const GUEST_ID = '33333333-3333-4333-8333-333333333333'
const OTHER_ID = '44444444-4444-4444-8444-444444444444'
const PATH = `${RESPONSE_ID}/aaaa-bbbb.bin`

interface RpcResult {
  data?: unknown
  error?: unknown
}

interface Scenario {
  /** admin.auth.getUser 결과(내부 사용자 경로). */
  authUser?: { id: string } | null
  /** users 원장 lookup 결과. */
  usersRow?: { id: string; user_type: string; is_active: boolean } | null
  /** 공용 게스트 세션 검증 결과(또는 던질 오류). */
  guestSession?: { user: { id: string; user_type: string } } | null
  guestThrows?: Error
  /** 호출자 토큰으로 읽은 file_collection_files 행. */
  fileRow?: Record<string, unknown> | null
  fileError?: unknown
  rpc?: Record<string, RpcResult>
  info?: { size?: number | null; contentType?: string | null } | null
  signUpload?: RpcResult
  signUrl?: RpcResult
  logError?: unknown
}

interface Calls {
  rpc: { name: string; args: unknown }[]
  callerTokens: string[]
  selects: string[]
  logs: Record<string, unknown>[]
  info: string[]
  signUpload: { path: string; opts: unknown }[]
  signUrl: { path: string; ttl: number; opts: unknown }[]
  buckets: string[]
}

function build(s: Scenario): { deps: FileCollectionDeps; calls: Calls } {
  const calls: Calls = {
    rpc: [],
    callerTokens: [],
    selects: [],
    logs: [],
    info: [],
    signUpload: [],
    signUrl: [],
    buckets: [],
  }

  const storage = (bucket: string) => {
    calls.buckets.push(bucket)
    return {
      info: async (path: string) => {
        calls.info.push(path)
        return s.info ? { data: s.info, error: null } : { data: null, error: { message: 'not found' } }
      },
      createSignedUploadUrl: async (path: string, opts: unknown) => {
        calls.signUpload.push({ path, opts })
        return s.signUpload ?? { data: null, error: { message: 'sign' } }
      },
      createSignedUrl: async (path: string, ttl: number, opts: unknown) => {
        calls.signUrl.push({ path, ttl, opts })
        return s.signUrl ?? { data: null, error: { message: 'sign' } }
      },
    }
  }

  const admin = {
    auth: { getUser: async () => ({ data: { user: s.authUser ?? null }, error: null }) },
    from: (table: string) => {
      if (table === 'access_logs') {
        return {
          insert: async (row: Record<string, unknown>) => {
            calls.logs.push(row)
            return { error: s.logError ?? null }
          },
        }
      }
      const q: Record<string, unknown> = {}
      const chain = () => q
      q.select = chain
      q.eq = chain
      q.is = chain
      q.maybeSingle = async () => ({ data: s.usersRow ?? null, error: null })
      return q
    },
    storage: { from: storage },
  }

  const asCaller = (token: string) => {
    calls.callerTokens.push(token)
    return {
      rpc: async (name: string, args: unknown) => {
        calls.rpc.push({ name, args })
        const r = s.rpc?.[name] ?? {}
        return { data: r.data ?? null, error: r.error ?? null }
      },
      from: (table: string) => {
        calls.selects.push(table)
        const q: Record<string, unknown> = {}
        const chain = () => q
        q.select = chain
        q.eq = chain
        q.is = chain
        q.maybeSingle = async () => ({ data: s.fileRow ?? null, error: s.fileError ?? null })
        return q
      },
    }
  }

  return {
    calls,
    deps: {
      admin: () => admin as never,
      asCaller: (token: string) => asCaller(token) as never,
      verifyGuestSession: async () => {
        if (s.guestThrows) throw s.guestThrows
        return (s.guestSession ?? null) as never
      },
    },
  }
}

/** 본문 스트림은 한 번만 읽을 수 있으므로 케이스마다 요청을 새로 만든다. */
function post(body: unknown, headers: Record<string, string> = { Authorization: 'Bearer t1' }) {
  return new Request('https://fn.local/file-collection-file', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

async function run(s: Scenario, req: Request) {
  const { deps, calls } = build(s)
  const res = await createFileCollectionHandler(deps)(req)
  const json = await res.clone().json().catch(() => null)
  return { res, json, calls }
}

/** 살아 있는 게스트 한 명. */
const guest: Scenario = { guestSession: { user: { id: GUEST_ID, user_type: 'external_startup' } } }
/** 살아 있는 내부 사용자 한 명. */
const internal: Scenario = {
  authUser: { id: 'auth-1' },
  usersRow: { id: OTHER_ID, user_type: 'internal', is_active: true },
}

const pendingRow = {
  id: FILE_ID,
  storage_bucket: BUCKET,
  storage_path: PATH,
  original_name: '계획서.pdf',
  content_type: 'application/pdf',
  byte_size: 100,
  status: 'PENDING',
  uploaded_by: GUEST_ID,
}

const signBody = {
  action: 'sign',
  responseId: RESPONSE_ID,
  fileName: '계획서.pdf',
  contentType: 'application/pdf',
  byteSize: 100,
}

// ---------------------------------------------------------------- 입구 검증

describe('입구', () => {
  it('POST가 아니면 405', async () => {
    const { res } = await run({}, new Request('https://fn.local/x', { method: 'GET' }))
    expect(res.status).toBe(405)
  })

  it('Authorization이 없으면 401', async () => {
    const { res } = await run(guest, post(signBody, {}))
    expect(res.status).toBe(401)
  })

  it('Bearer가 아닌 인증 수단의 값을 토큰으로 재해석하지 않는다', async () => {
    for (const header of ['Basic dXNlcjpwdw==', 'Bearer', 'Bearer a b', 'tokenonly']) {
      const { res, calls } = await run(guest, post(signBody, { Authorization: header }))
      expect(res.status).toBe(401)
      expect(calls.callerTokens).toEqual([])
    }
  })

  it('세션 검증이 null이면 401이고 어떤 질의도 나가지 않는다', async () => {
    const { res, json, calls } = await run({ guestSession: null }, post(signBody))
    expect(res.status).toBe(401)
    expect(json).toEqual({ error: 'unauthorized' })
    expect(calls.rpc).toEqual([])
    expect(calls.signUpload).toEqual([])
  })

  it('비활성 내부 계정은 401', async () => {
    const s = { ...internal, usersRow: { id: OTHER_ID, user_type: 'internal', is_active: false } }
    const { res } = await run(s, post({ action: 'download', fileId: FILE_ID }))
    expect(res.status).toBe(401)
  })

  it('게스트가 아닌 계정의 커스텀 토큰은 게스트로 인정하지 않는다', async () => {
    const s: Scenario = { guestSession: { user: { id: OTHER_ID, user_type: 'internal' } } }
    const { res } = await run(s, post(signBody))
    expect(res.status).toBe(401)
  })

  it('게스트 서명 비밀이 없으면 500 jwt_secret_missing', async () => {
    const s: Scenario = { guestThrows: new Error('jwt_secret_missing') }
    const { res, json } = await run(s, post(signBody))
    expect(res.status).toBe(500)
    expect(json).toEqual({ error: 'jwt_secret_missing' })
  })

  it('모르는 action은 400 unsupported_action, 잘못된 UUID는 400 invalid_request', async () => {
    const a = await run(guest, post({ action: 'purge', fileId: FILE_ID }))
    expect(a.res.status).toBe(400)
    expect(a.json).toEqual({ error: 'unsupported_action' })
    const b = await run(guest, post({ action: 'commit', fileId: 'nope' }))
    expect(b.res.status).toBe(400)
    expect(b.json).toEqual({ error: 'invalid_request' })
  })

  it('JSON이 아니면 400', async () => {
    const { res, json } = await run(guest, post('{not json'))
    expect(res.status).toBe(400)
    expect(json).toEqual({ error: 'invalid_request' })
  })

  it('본문이 상한을 넘으면 413이고 인증까지 가지 않는다', async () => {
    const big = JSON.stringify({ action: 'sign', pad: 'x'.repeat(9000) })
    const { res, json, calls } = await run(guest, post(big))
    expect(res.status).toBe(413)
    expect(json).toEqual({ error: 'payload_too_large' })
    expect(calls.callerTokens).toEqual([])
  })

  it('Content-Length를 속여도 스트림 상한에서 끊긴다', async () => {
    // 헤더 사전 검사만으로는 못 막는 자리다. 상한을 넘는 순간 읽기를 멈춰야 한다.
    let pushed = 0
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pushed += 1
        if (pushed > 200) return controller.close()
        controller.enqueue(new TextEncoder().encode('x'.repeat(1024)))
      },
    })
    const req = new Request('https://fn.local/x', {
      method: 'POST',
      headers: { Authorization: 'Bearer t1', 'content-length': '10' },
      body: stream,
      // @ts-expect-error undici는 스트림 본문에 duplex를 요구한다(Deno는 요구하지 않는다).
      duplex: 'half',
    })
    const { res, calls } = await run(guest, req)
    expect(res.status).toBe(413)
    expect(calls.callerTokens).toEqual([])
    // 상한(8KiB)을 조금 넘긴 자리에서 멈췄고, 스트림을 끝까지 읽지 않았다.
    expect(pushed).toBeLessThan(100)
  })

  it('한글 본문의 바이트 수로 상한을 본다(코드 단위 수가 아니다)', async () => {
    // 3000자 = UTF-8 9000바이트 남짓. string.length만 보면 통과해 버린다.
    const body = JSON.stringify({ action: 'sign', pad: '가'.repeat(3000) })
    expect(body.length).toBeLessThan(8 * 1024)
    const { res } = await run(guest, post(body))
    expect(res.status).toBe(413)
  })
})

// ------------------------------------------------------------------- sign

describe('sign(업로드 서명)', () => {
  const okRegister = {
    rpc: {
      file_collection_register_upload: {
        data: [{ file_id: FILE_ID, storage_bucket: BUCKET, storage_path: PATH }],
      },
    },
  }

  it('배정받은 게스트에게 upsert:false 업로드 주소를 발급한다', async () => {
    const s: Scenario = {
      ...guest,
      ...okRegister,
      signUpload: { data: { path: PATH, token: 'tok', signedUrl: 'https://s/up' } },
    }
    const { res, json, calls } = await run(s, post(signBody))
    expect(res.status).toBe(200)
    expect(json).toEqual({
      fileId: FILE_ID,
      bucket: BUCKET,
      path: PATH,
      token: 'tok',
      signedUrl: 'https://s/up',
    })
    expect(calls.rpc).toEqual([
      {
        name: 'file_collection_register_upload',
        args: {
          p_response_id: RESPONSE_ID,
          p_original_name: '계획서.pdf',
          p_content_type: 'application/pdf',
          p_byte_size: 100,
        },
      },
    ])
    expect(calls.callerTokens).toEqual(['t1'])
    expect(calls.buckets).toEqual([BUCKET])
    expect(calls.signUpload).toEqual([{ path: PATH, opts: { upsert: false } }])
    expect(res.headers.get('Cache-Control')).toBe('no-store')
  })

  it('내부 사용자는 게스트 업로드를 대행하지 못한다 — RPC까지 가지 않는다', async () => {
    const { res, json, calls } = await run({ ...internal, ...okRegister }, post(signBody))
    expect(res.status).toBe(403)
    expect(json).toEqual({ error: 'forbidden' })
    expect(calls.rpc).toEqual([])
    expect(calls.signUpload).toEqual([])
  })

  it('DB가 등록을 거절하면(배정 없음·마감) 403이고 서명하지 않는다', async () => {
    const s: Scenario = {
      ...guest,
      rpc: { file_collection_register_upload: { error: { message: 'denied' } } },
    }
    const { res, json, calls } = await run(s, post(signBody))
    expect(res.status).toBe(403)
    expect(json).toEqual({ error: 'register_denied' })
    expect(calls.signUpload).toEqual([])
  })

  it('RPC가 빈 결과를 주면 403', async () => {
    const s: Scenario = { ...guest, rpc: { file_collection_register_upload: { data: [] } } }
    const { res, json } = await run(s, post(signBody))
    expect(res.status).toBe(403)
    expect(json).toEqual({ error: 'register_denied' })
  })

  it('RPC가 다른 버킷·상위 경로를 주면 서명하지 않는다', async () => {
    const s: Scenario = {
      ...guest,
      rpc: {
        file_collection_register_upload: {
          data: [{ file_id: FILE_ID, storage_bucket: 'attachments', storage_path: '../x' }],
        },
      },
    }
    const { res, json, calls } = await run(s, post(signBody))
    expect(res.status).toBe(500)
    expect(json).toEqual({ error: 'internal_error' })
    expect(calls.signUpload).toEqual([])
  })

  it('서명 실패는 PENDING으로 남은 fileId를 함께 알린다(내부 경로는 싣지 않는다)', async () => {
    const s: Scenario = { ...guest, ...okRegister, signUpload: { error: { message: 'boom' } } }
    const { res, json } = await run(s, post(signBody))
    expect(res.status).toBe(500)
    expect(json).toMatchObject({ error: 'sign_failed', fileId: FILE_ID })
    expect(JSON.stringify(json)).not.toContain(PATH)
  })
})

// ----------------------------------------------------------------- commit

describe('commit(확정)', () => {
  const commitReq = () => post({ action: 'commit', fileId: FILE_ID })
  const goodInfo = { size: 100, contentType: 'application/pdf' }

  it('실물 대조 후 파일 id 하나만 실어 확정 RPC를 부른다', async () => {
    const s: Scenario = { ...guest, fileRow: pendingRow, info: goodInfo, rpc: {} }
    const { res, json, calls } = await run(s, commitReq())
    expect(res.status).toBe(200)
    expect(json).toEqual({ fileId: FILE_ID })
    // 크기·형식은 DB가 storage.objects에서 직접 읽는다. 옛 인자를 함께 보내면 PGRST202로 깨진다.
    expect(calls.rpc).toEqual([
      { name: 'file_collection_commit_upload', args: { p_file_id: FILE_ID } },
    ])
    expect(calls.info).toEqual([PATH])
  })

  it('내부 사용자는 게스트의 업로드를 확정하지 못한다', async () => {
    const { res, json, calls } = await run({ ...internal, fileRow: pendingRow }, commitReq())
    expect(res.status).toBe(403)
    expect(json).toEqual({ error: 'forbidden' })
    expect(calls.selects).toEqual([])
  })

  it('호출자 토큰 질의가 빈 결과면(다른 게스트) 403 — 대역이 아니라 DB가 답한 전제다', async () => {
    const { res, json, calls } = await run({ ...guest, fileRow: null }, commitReq())
    expect(res.status).toBe(403)
    expect(json).toEqual({ error: 'forbidden' })
    expect(calls.selects).toEqual(['file_collection_files'])
    expect(calls.rpc).toEqual([])
    expect(calls.info).toEqual([])
  })

  it('읽을 수는 있지만 올린 사람이 다르면 403', async () => {
    const s: Scenario = { ...guest, fileRow: { ...pendingRow, uploaded_by: OTHER_ID }, info: goodInfo }
    const { res, calls } = await run(s, commitReq())
    expect(res.status).toBe(403)
    expect(calls.rpc).toEqual([])
  })

  it('질의 자체가 실패하면 500', async () => {
    const s: Scenario = { ...guest, fileError: { message: 'boom' } }
    const { res, json } = await run(s, commitReq())
    expect(res.status).toBe(500)
    expect(json).toEqual({ error: 'internal_error' })
  })

  it('실물이 없으면 404이고 확정하지 않는다', async () => {
    const s: Scenario = { ...guest, fileRow: pendingRow, info: null }
    const { res, json, calls } = await run(s, commitReq())
    expect(res.status).toBe(404)
    expect(json).toEqual({ error: 'object_missing' })
    expect(calls.rpc).toEqual([])
  })

  it('크기·형식이 선언과 어긋나면 400이고 확정하지 않는다', async () => {
    for (const info of [
      { size: 999, contentType: 'application/pdf' },
      { size: 100, contentType: 'image/png' },
      { size: 0, contentType: 'application/pdf' },
    ]) {
      const { res, calls } = await run({ ...guest, fileRow: pendingRow, info }, commitReq())
      expect(res.status).toBe(400)
      expect(calls.rpc).toEqual([])
    }
  })

  it('저장 위치가 어긋난 행은 실물을 묻지도 않는다', async () => {
    const s: Scenario = { ...guest, fileRow: { ...pendingRow, storage_path: '/etc/passwd' }, info: goodInfo }
    const { res, json, calls } = await run(s, commitReq())
    expect(res.status).toBe(500)
    expect(json).toEqual({ error: 'internal_error' })
    expect(calls.info).toEqual([])
    expect(calls.rpc).toEqual([])
  })

  it('이미 READY인 재시도는 본인 확인 뒤 DB에 다시 물어 멱등하게 성공한다', async () => {
    // 확정 응답이 유실된 뒤의 재시도다. 실물 대조는 되풀이하지 않지만 권한은 DB가 다시 본다.
    const s: Scenario = { ...guest, fileRow: { ...pendingRow, status: 'READY' }, rpc: {} }
    const { res, json, calls } = await run(s, commitReq())
    expect(res.status).toBe(200)
    expect(json).toEqual({ fileId: FILE_ID })
    expect(calls.info).toEqual([])
    expect(calls.rpc).toEqual([
      { name: 'file_collection_commit_upload', args: { p_file_id: FILE_ID } },
    ])
  })

  it('READY 재시도라도 배정이 회수됐으면 DB 거절이 그대로 403이 된다', async () => {
    const s: Scenario = {
      ...guest,
      fileRow: { ...pendingRow, status: 'READY' },
      rpc: { file_collection_commit_upload: { error: { message: 'denied' } } },
    }
    const { res, json } = await run(s, commitReq())
    expect(res.status).toBe(403)
    expect(json).toEqual({ error: 'commit_denied' })
  })

  it('READY 재시도도 올린 사람이 아니면 DB에 묻지 않는다', async () => {
    const s: Scenario = {
      ...guest,
      fileRow: { ...pendingRow, status: 'READY', uploaded_by: OTHER_ID },
    }
    const { res, calls } = await run(s, commitReq())
    expect(res.status).toBe(403)
    expect(calls.rpc).toEqual([])
  })

  it('모르는 상태(삭제·반려 등)는 확정으로 넘어가지 않는다', async () => {
    for (const status of ['DELETED', 'REJECTED', '', 'ready']) {
      const s: Scenario = { ...guest, fileRow: { ...pendingRow, status }, info: goodInfo }
      const { res, json, calls } = await run(s, commitReq())
      expect(res.status).toBe(409)
      expect(json).toEqual({ error: 'invalid_state' })
      expect(calls.rpc).toEqual([])
    }
  })

  it('회차가 닫혔으면 실물이 맞아도 DB가 거절한다', async () => {
    const s: Scenario = {
      ...guest,
      fileRow: pendingRow,
      info: goodInfo,
      rpc: { file_collection_commit_upload: { error: { message: 'closed' } } },
    }
    const { res, json } = await run(s, commitReq())
    expect(res.status).toBe(403)
    expect(json).toEqual({ error: 'commit_denied' })
  })
})

// --------------------------------------------------------------- download

describe('download(반출)', () => {
  const downloadReq = () => post({ action: 'download', fileId: FILE_ID })
  const authorized = {
    rpc: {
      file_collection_authorize_download: {
        data: [{ storage_bucket: BUCKET, storage_path: PATH, original_name: '계획서.pdf' }],
      },
    },
  }
  const signed = { signUrl: { data: { signedUrl: 'https://s/down' } } }

  it('내부 사용자에게 로그 적재 뒤 60초 서명 주소를 준다', async () => {
    const { res, json, calls } = await run({ ...internal, ...authorized, ...signed }, downloadReq())
    expect(res.status).toBe(200)
    expect(json).toEqual({ url: 'https://s/down', fileName: '계획서.pdf' })
    expect(calls.rpc).toEqual([
      { name: 'file_collection_authorize_download', args: { p_file_id: FILE_ID } },
    ])
    expect(calls.logs).toEqual([
      {
        user_id: OTHER_ID,
        resource_type: 'file_collection_download',
        resource_id: FILE_ID,
        reason: '파일받기 다운로드: 계획서.pdf',
      },
    ])
    expect(calls.signUrl).toEqual([{ path: PATH, ttl: 60, opts: { download: '계획서.pdf' } }])
  })

  it('게스트 본인도 같은 경로로 내려받고 같은 기록을 남긴다', async () => {
    const { res, json, calls } = await run({ ...guest, ...authorized, ...signed }, downloadReq())
    expect(res.status).toBe(200)
    expect(json).toMatchObject({ url: 'https://s/down' })
    expect(calls.logs[0]).toMatchObject({ user_id: GUEST_ID })
  })

  it('DB가 반출을 거절하면 403이고 로그도 서명도 없다', async () => {
    const s: Scenario = {
      ...guest,
      rpc: { file_collection_authorize_download: { error: { message: 'denied' } } },
    }
    const { res, json, calls } = await run(s, downloadReq())
    expect(res.status).toBe(403)
    expect(json).toEqual({ error: 'forbidden' })
    expect(calls.logs).toEqual([])
    expect(calls.signUrl).toEqual([])
  })

  it('빈 결과(같은 기업의 다른 게스트)도 403', async () => {
    const s: Scenario = { ...guest, rpc: { file_collection_authorize_download: { data: [] } } }
    const { res, calls } = await run(s, downloadReq())
    expect(res.status).toBe(403)
    expect(calls.signUrl).toEqual([])
  })

  it('RPC가 위조된 버킷·경로를 주면 서명하지 않고 로그도 남기지 않는다', async () => {
    const s: Scenario = {
      ...guest,
      rpc: {
        file_collection_authorize_download: {
          data: [{ storage_bucket: 'attachments', storage_path: '../secrets/a', original_name: 'a' }],
        },
      },
      ...signed,
    }
    const { res, json, calls } = await run(s, downloadReq())
    expect(res.status).toBe(500)
    expect(json).toEqual({ error: 'internal_error' })
    expect(calls.logs).toEqual([])
    expect(calls.signUrl).toEqual([])
  })

  it('로그를 남기지 못하면 서명하지 않는다 — 로그 없는 반출은 없다', async () => {
    const s: Scenario = { ...guest, ...authorized, ...signed, logError: { message: 'boom' } }
    const { res, json, calls } = await run(s, downloadReq())
    expect(res.status).toBe(500)
    expect(json).toMatchObject({ error: 'log_failed' })
    expect(calls.signUrl).toEqual([])
  })

  it('서명 실패는 500 sign_failed이고 내부 경로를 싣지 않는다', async () => {
    const s: Scenario = { ...guest, ...authorized, signUrl: { error: { message: 'boom' } } }
    const { res, json } = await run(s, downloadReq())
    expect(res.status).toBe(500)
    expect(json).toEqual({ error: 'sign_failed' })
    expect(JSON.stringify(json)).not.toContain(PATH)
  })
})
