// PostgREST 쿼리 빌더의 최소 대역 — Edge Function 판정 테스트용 가짜 DB.
//
// 런타임 코드가 아니다. 어느 index.ts도 이 파일을 import하지 않으며, 게스트 인증 계통의
// 테스트(로그인·비밀번호 설정·맥락 선택)가 공유한다. 한 벌만 두는 이유: 같은 계통의 세
// 핸들러가 같은 표(users·guest_credentials·program_participants·사업 원장)를 읽으므로,
// 가짜가 두 벌이면 한쪽만 실제 호출 모양을 따라가고 다른 쪽은 조용히 낡는다.
//
// 받는 모양은 이 계통이 실제로 부르는 것뿐이다(select/insert/update + eq·neq·is·in·limit
// + maybeSingle). 결과는 메모리 표에서 만들고, 판정·해시·서명은 실제 구현이 돈다.

export type Row = Record<string, unknown>

export interface FakeDb {
  /** SupabaseClient 자리에 그대로 넣는 가짜 클라이언트. */
  client: never
  tables: Record<string, Row[]>
  /** 일어난 쓰기의 순서 기록 — "저장이 세션보다 먼저"처럼 순서가 사실인 단언에 쓴다. */
  writes: { table: string; op: string; patch?: Row }[]
  /** 이 (표, 연산)에 에러를 돌려준다 — 저장 실패 뒤의 착지를 보기 위해서. */
  failWrite(table: string, op: string): void
  /** 이 RPC에 전송 오류를 돌려준다(우리 쪽 장애 착지 확인용). */
  failRpc(name: string): void
  /**
   * 이 RPC가 **돌기 직전에** 원장을 바꾼다 — 경합의 재현이다. 핸들러가 상태를 읽은
   * 뒤부터 조건부 쓰기가 판정되기까지 사이에 ADMIN 초기화·다른 창의 저장이 끼어드는
   * 자리가 바로 여기이며, 그 창이 닫혔는지는 이 훅 없이는 볼 수 없다.
   */
  beforeRpc(name: string, fn: () => void): void
  /**
   * 이 표를 **읽기 직전에** 원장을 바꾼다. 인자는 그 표의 몇 번째 질의인지(1부터)다 —
   * 같은 요청이 같은 표를 두 번 읽는 자리(세션 검증 → 계정 재조회)의 사이를 노린다.
   */
  beforeQuery(table: string, fn: (nth: number) => void): void
}

/** 자격증명 원장이 붙는 계정 유형. SSOT는 DB의 app.is_guest_user_type이다. */
const GUEST_TYPES = new Set(['external_startup', 'external_expert', 'temporary_guest'])

export function fakeDb(tables: Record<string, Row[]>): FakeDb {
  const writes: { table: string; op: string; patch?: Row }[] = []
  let writeError: { table: string; op: string } | null = null
  const rpcErrors = new Set<string>()
  const rpcHooks = new Map<string, () => void>()
  const queryHooks = new Map<string, (nth: number) => void>()
  const queryCounts = new Map<string, number>()

  function rowsOf(table: string): Row[] {
    if (!tables[table]) tables[table] = []
    return tables[table]
  }

  /**
   * public.guest_password_commit의 대역 — 조건부 쓰기(비교 후 교체)를 그대로 흉내낸다.
   * 판정의 정본은 SQL이며 그 쪽은 pgTAP(guest_admin_contact_reset_test.sql)이 본다.
   * 여기서는 핸들러가 **성공·만료·충돌을 어떻게 착지시키는지**를 보기 위해 같은 규칙을 둔다.
   */
  function guestPasswordCommit(args: Row): Row {
    const user = liveGuest(args.p_user_id)
    if (!user) return { committed: false, reason: 'account_unavailable' }
    if ((user.session_version ?? 1) !== args.p_expected_session_version) {
      return { committed: false, reason: 'version_mismatch' }
    }

    const creds = rowsOf('guest_credentials')
    const cred = creds.find((c) => c.user_id === args.p_user_id)
    const stored = (cred?.password_hash as string | null | undefined) ?? null
    const expected = (args.p_expected_password_hash as string | null) ?? null
    if (stored !== expected) return { committed: false, reason: 'password_changed' }

    const patch: Row = {
      password_hash: args.p_new_password_hash,
      password_set_at: new Date().toISOString(),
      login_attempts: 0,
      locked_until: null,
      reset_token_hash: null,
      reset_expires_at: null,
    }
    if (cred) Object.assign(cred, patch)
    else creds.push({ user_id: args.p_user_id, ...patch })
    // 쓰기 순서 단언이 이 경로도 보도록 기록을 남긴다(종전 table update와 같은 자리).
    writes.push({ table: 'guest_credentials', op: 'commit', patch })

    let version = (user.session_version as number) ?? 1
    if (args.p_consume_ticket) {
      version += 1
      user.session_version = version
    }
    return { committed: true, session_version: version }
  }

  /** 살아 있고 활성이며 GUEST인 계정인가 — 세 RPC 대역이 같은 판정을 쓴다. */
  function liveGuest(userId: unknown): Row | null {
    const user = rowsOf('users').find((u) => u.id === userId)
    if (
      !user ||
      user.deleted_at ||
      user.is_active === false ||
      !GUEST_TYPES.has(String(user.user_type))
    ) {
      return null
    }
    return user
  }

  /** public.guest_reset_token_issue의 대역 — 판이 맞을 때만 토큰을 적고 그 판을 남긴다. */
  function guestResetTokenIssue(args: Row): Row {
    const user = liveGuest(args.p_user_id)
    if (!user) return { issued: false, reason: 'account_unavailable' }
    if ((user.session_version ?? 1) !== args.p_expected_session_version) {
      return { issued: false, reason: 'version_mismatch' }
    }

    const creds = rowsOf('guest_credentials')
    const patch: Row = {
      reset_token_hash: args.p_token_hash,
      reset_expires_at: args.p_expires_at,
      reset_session_version: user.session_version ?? 1,
      login_attempts: 0,
      locked_until: null,
    }
    const cred = creds.find((c) => c.user_id === args.p_user_id)
    if (cred) Object.assign(cred, patch)
    else creds.push({ user_id: args.p_user_id, password_hash: null, ...patch })
    writes.push({ table: 'guest_credentials', op: 'reset_issue', patch })

    return { issued: true, session_version: user.session_version ?? 1 }
  }

  /** public.guest_reset_token_consume의 대역 — 조건을 다 보고 정확히 한 번 비운다. */
  function guestResetTokenConsume(args: Row): Row {
    const creds = rowsOf('guest_credentials')
    const cred = creds.find((c) => c.reset_token_hash === args.p_token_hash)
    if (!cred) return { consumed: false, reason: 'not_found' }

    const user = liveGuest(cred.user_id)
    if (!user) return { consumed: false, reason: 'account_unavailable' }

    const endsAt = cred.reset_expires_at as string | null | undefined
    if (!endsAt || new Date(endsAt).getTime() <= Date.now()) {
      return { consumed: false, reason: 'expired' }
    }
    if ((cred.reset_session_version ?? null) !== (user.session_version ?? 1)) {
      return { consumed: false, reason: 'version_mismatch' }
    }

    Object.assign(cred, {
      reset_token_hash: null,
      reset_expires_at: null,
      reset_session_version: null,
      login_attempts: 0,
      locked_until: null,
    })
    writes.push({ table: 'guest_credentials', op: 'reset_consume' })

    return {
      consumed: true,
      user_id: cred.user_id,
      session_version: user.session_version ?? 1,
      name: user.name,
    }
  }

  function builder(table: string) {
    const filters: ((r: Row) => boolean)[] = []
    let op = 'select'
    let patch: Row = {}
    let max = Infinity

    const run = (): { data: unknown; error: unknown } => {
      if (op === 'select') {
        const nth = (queryCounts.get(table) ?? 0) + 1
        queryCounts.set(table, nth)
        queryHooks.get(table)?.(nth)
      }
      const matched = rowsOf(table).filter((r) => filters.every((f) => f(r)))
      if (op === 'select') return { data: matched.slice(0, max), error: null }
      writes.push({ table, op, patch })
      if (writeError && writeError.table === table && writeError.op === op) {
        return { data: null, error: { message: 'write_failed' } }
      }
      if (op === 'insert') rowsOf(table).push({ ...patch })
      if (op === 'update') for (const r of matched) Object.assign(r, patch)
      return { data: null, error: null }
    }

    const api = {
      select: (_cols?: string) => api,
      insert: (values: Row) => {
        op = 'insert'
        patch = values
        return api
      },
      update: (values: Row) => {
        op = 'update'
        patch = values
        return api
      },
      eq: (col: string, val: unknown) => {
        filters.push((r) => r[col] === val)
        return api
      },
      neq: (col: string, val: unknown) => {
        filters.push((r) => r[col] !== val)
        return api
      },
      is: (col: string, val: unknown) => {
        filters.push((r) => (val === null ? r[col] == null : r[col] === val))
        return api
      },
      in: (col: string, vals: unknown[]) => {
        filters.push((r) => vals.includes(r[col]))
        return api
      },
      limit: (n: number) => {
        max = n
        return api
      },
      maybeSingle: () => {
        const res = run()
        const data = Array.isArray(res.data) ? (res.data[0] ?? null) : res.data
        return Promise.resolve({ data, error: res.error })
      },
      // awaited 되는 순간 질의가 돈다(PostgREST 빌더와 같은 모양).
      then: (resolve: (v: { data: unknown; error: unknown }) => unknown) =>
        Promise.resolve(run()).then(resolve),
    }
    return api
  }

  function rpc(name: string, args: Row) {
    rpcHooks.get(name)?.()
    if (rpcErrors.has(name)) {
      return Promise.resolve({ data: null, error: { message: 'rpc_failed' } })
    }
    if (name === 'guest_password_commit') {
      return Promise.resolve({ data: guestPasswordCommit(args), error: null })
    }
    if (name === 'guest_reset_token_issue') {
      return Promise.resolve({ data: guestResetTokenIssue(args), error: null })
    }
    if (name === 'guest_reset_token_consume') {
      return Promise.resolve({ data: guestResetTokenConsume(args), error: null })
    }
    return Promise.resolve({ data: null, error: { message: `unknown_rpc:${name}` } })
  }

  return {
    client: { from: (table: string) => builder(table), rpc } as never,
    tables,
    writes,
    failWrite(table: string, op: string) {
      writeError = { table, op }
    },
    failRpc(name: string) {
      rpcErrors.add(name)
    },
    beforeRpc(name: string, fn: () => void) {
      rpcHooks.set(name, fn)
    },
    beforeQuery(table: string, fn: (nth: number) => void) {
      queryHooks.set(table, fn)
    },
  }
}
