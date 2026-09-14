import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { signJwt } from '../_shared/crypto.ts'
import { fakeDb } from '../_shared/fakeSupabase.ts'
import { createRefreshHandler } from './handler.ts'

const SECRET = 'test-guest-jwt-secret'
const USER_ID = '44444444-4444-4444-8444-444444444444'

function seed() {
  return fakeDb({
    users: [
      {
        id: USER_ID,
        user_type: 'external_startup',
        name: '계정 이름',
        email: 'guest@example.com',
        affiliation: '계정 소속',
        session_version: 3,
        is_active: true,
        deleted_at: null,
      },
    ],
    program_participants: [
      {
        id: 'pp-1',
        program_id: 'pg-1',
        entity_key: 'program',
        user_id: USER_ID,
        login_status: 'ACTIVE',
        joined_at: '2026-09-01T00:00:00.000Z',
      },
    ],
    programs: [
      {
        id: 'pg-1',
        code: 'AC-2026',
        title: '2026 액셀러레이팅',
        status: 'ACTIVE',
        start_date: '2026-01-01',
        end_date: '2026-12-31',
        host_organization: '와이앤아처',
        deleted_at: null,
        guest_access_ends_at: null,
      },
    ],
    // 레거시 데이터가 남아 있더라도 새로고침의 계정 정본은 users다.
    startups: [{ id: 'st-1', name: '원장 소속', representative: '원장 이름' }],
    networks: [{ id: 'nw-1', name: '원장 이름' }],
  })
}

const env: Record<string, string | undefined> = {}
const g = globalThis as unknown as {
  Deno?: { env: { get(key: string): string | undefined } }
}

beforeEach(() => {
  env.GUEST_JWT_SECRET = SECRET
  g.Deno = { env: { get: (key: string) => env[key] } }
})

afterEach(() => {
  delete g.Deno
})

async function sessionToken() {
  const nowSec = Math.floor(Date.now() / 1000)
  return await signJwt(
    {
      sub: USER_ID,
      aud: 'authenticated',
      role: 'authenticated',
      app_user_id: USER_ID,
      app_role: 'external_startup',
      session_version: 3,
      context_type: 'program',
      context_id: 'pg-1',
      program_id: 'pg-1',
      iat: nowSec,
      exp: nowSec + 3600,
    },
    SECRET,
  )
}

async function refresh(db: ReturnType<typeof seed>) {
  const res = await createRefreshHandler(() => db.client)(
    new Request('https://fn.test/guest-auth-refresh', {
      method: 'POST',
      headers: { Authorization: `Bearer ${await sessionToken()}` },
    }),
  )
  return { status: res.status, body: await res.json() }
}

describe('독립 GUEST 계정 새로고침', () => {
  it('users의 이름·소속·이메일만 계정 프로필로 돌려주고 원장을 읽거나 수정하지 않는다', async () => {
    const db = seed()
    db.beforeQuery('startups', () => { throw new Error('participant_ledger_must_not_be_read') })
    db.beforeQuery('networks', () => { throw new Error('participant_ledger_must_not_be_read') })

    const { status, body } = await refresh(db)

    expect(status).toBe(200)
    expect(body.user).toEqual({
      id: USER_ID,
      user_type: 'external_startup',
      name: '계정 이름',
      email: 'guest@example.com',
      affiliation: '계정 소속',
    })
    expect(body).not.toHaveProperty('company')
    expect(body.user).not.toHaveProperty('company_id')
    expect(body.participation).toEqual({ joined_at: '2026-09-01T00:00:00.000Z' })
    expect(body.contexts[0]).not.toHaveProperty('persona')
    expect(db.writes).toEqual([])
  })

  it('세션 판이 맞지 않으면 계정·사업 정보를 노출하지 않는다', async () => {
    const db = seed()
    db.tables.users[0].session_version = 4

    const { status, body } = await refresh(db)

    expect(status).toBe(401)
    expect(body.error).toBe('session_expired')
    expect(body.user).toBeUndefined()
    expect(db.writes).toEqual([])
  })
})
