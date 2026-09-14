import { describe, expect, it } from 'vitest'
import { fakeDb, type Row } from '../_shared/fakeSupabase.ts'
import { createInviteHandler, type InviteHandlerDeps } from './handler.ts'

interface Opened extends Row {
  participant_id: string
  program_code: string
  target_name: string
  email: string | null
  account_is_new: boolean
}

function callerClient(rows: Opened[], error: { code?: string; message: string } | null = null) {
  const db = fakeDb({
    program_participants: [{ id: 'pp-1', program_id: 'pg-1' }],
    programs: [{ id: 'pg-1', title: '2026 액셀러레이팅' }],
    ma_programs: [],
    funds: [],
  })
  const base = db.client as unknown as { from(table: string): unknown }
  return () => ({
    from: base.from,
    rpc: () => Promise.resolve({ data: error ? null : rows, error }),
  }) as never
}

function recorder(ok = true) {
  const calls: { channel: string; to: string; templateCode: string }[] = []
  const notify: InviteHandlerDeps['notify'] = (input) => {
    calls.push({ channel: input.channel, to: input.to, templateCode: input.templateCode })
    return Promise.resolve({ ok } as Awaited<ReturnType<InviteHandlerDeps['notify']>>)
  }
  return { calls, notify }
}

async function invoke(
  rows: Opened[],
  options: {
    notify?: InviteHandlerDeps['notify']
    authorization?: string | null
    error?: { code?: string; message: string } | null
  } = {},
) {
  const handler = createInviteHandler({
    caller: callerClient(rows, options.error),
    notify: options.notify ?? recorder().notify,
  })
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const authorization = options.authorization === undefined ? 'Bearer internal-token' : options.authorization
  if (authorization) headers.Authorization = authorization
  const res = await handler(new Request('https://fn.test/guest-access-invite', {
    method: 'POST',
    headers,
    body: JSON.stringify({ participantIds: ['pp-1'] }),
  }))
  return { status: res.status, body: await res.json() }
}

const opened = (over: Partial<Opened> = {}): Opened => ({
  participant_id: 'pp-1',
  program_code: 'AC-2026',
  target_name: '김게스트',
  email: 'guest@example.com',
  account_is_new: true,
  ...over,
})

describe('GUEST 접속 안내 수신처', () => {
  it('계정 이메일로만 EMAIL 안내를 보낸다', async () => {
    const notifier = recorder()

    const { status, body } = await invoke(
      [opened({ phone: '010-1234-5678' })],
      { notify: notifier.notify },
    )

    expect(status).toBe(200)
    expect(body).toEqual({ opened: 1, notified: 1, failed: 0 })
    expect(notifier.calls).toEqual([{
      channel: 'EMAIL',
      to: 'guest@example.com',
      templateCode: 'GUEST_INVITE_NEW',
    }])
  })

  it('이메일이 없으면 레거시 전화번호가 있어도 발송하지 않는다', async () => {
    const notifier = recorder()

    const { status, body } = await invoke(
      [opened({ email: null, phone: '010-1234-5678' })],
      { notify: notifier.notify },
    )

    expect(status).toBe(200)
    expect(body).toEqual({ opened: 1, notified: 0, failed: 1 })
    expect(notifier.calls).toEqual([])
  })

  it('호출자 토큰이 없으면 RPC와 발송 전에 401로 끝난다', async () => {
    const notifier = recorder()

    const { status, body } = await invoke([opened()], {
      notify: notifier.notify,
      authorization: null,
    })

    expect(status).toBe(401)
    expect(body.error).toBe('unauthorized')
    expect(notifier.calls).toEqual([])
  })
})
