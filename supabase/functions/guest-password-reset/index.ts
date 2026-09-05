// 게스트 비밀번호 재설정 — 두 방향이 한 함수에 산다.
//
// [발송] { userId } + Authorization: Bearer <내부 사용자 토큰>
//   내부 사용자가 "재설정 안내 보내기"를 누른다. **호출자에게는 어떤 값도 돌려주지 않는다** —
//   링크는 게스트 본인 연락처로만 나간다. 종전의 담당자 '비밀번호 초기화'를 대체한다:
//   계정을 사업마다 갈라 두었을 때는 담당자가 값을 알아도 자기 사업만 열렸지만, 계정을
//   합치면 그 게스트가 참여 중인 **다른 팀 사업까지 전부** 열린다.
//
// [소진] { resetToken }
//   게스트가 링크를 눌러 들어온다. 토큰이 유효하면 비밀번호 설정 티켓으로 바꿔 준다 —
//   그 다음은 guest-auth-password의 설정 모드가 이어받는다(정책·저장이 한곳에 있어야 한다).
//
// 인가는 이 함수가 아니라 RPC(authorize_guest_password_reset)가 진다. 호출자의 토큰을
// 그대로 달아 PostgREST로 보내므로 SECURITY INVOKER + RLS가 그대로 걸린다. service_role을
// 쓰지 않는 이유가 그것이다 — 여기서 관리자 키를 쓰면 판정을 이 함수 안에 복제해야 하고
// 그 복제본이 곧 권한 구멍이 된다. 감사 로그도 그 RPC가 남긴다.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { jsonResponse, withCors } from '../_shared/cors.ts'
import { sha256Hex } from '../_shared/crypto.ts'
import { loadAccount, signChangeTicket, CHANGE_TTL_SEC } from '../_shared/guestAccount.ts'
import { sendNotification } from '../_shared/notifications.ts'
import { supabaseAdmin } from '../_shared/supabaseAdmin.ts'

/** 재설정 링크 수명. 짧게 둔다 — 메일함에 오래 남는 링크는 그 자체가 열쇠다. */
const RESET_TTL_MIN = 30

const INVALID = {
  error: 'reset_invalid',
  message: '링크가 만료되었거나 이미 사용되었습니다. 다시 요청해 주세요.',
}

/** 추측 불가능한 토큰. 저장은 해시만 한다 — 원장이 새도 링크가 되지 않아야 한다. */
function newToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

async function handleSend(req: Request, userId: string): Promise<Response> {
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return jsonResponse({ error: 'unauthorized' }, 401)

  // 호출자 권한으로 동작하는 클라이언트(RLS 적용).
  const caller = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    },
  )

  const { error } = await caller.rpc('authorize_guest_password_reset', { p_user_id: userId })
  if (error) {
    const denied = error.code === '42501'
    return jsonResponse(
      { error: denied ? 'forbidden' : 'reset_failed', message: error.message },
      denied ? 403 : 400,
    )
  }

  // 여기부터는 service_role이다. 자격증명 원장에는 정책이 하나도 없어 다른 경로가 없다.
  const db = supabaseAdmin()
  const account = await loadAccount(db, userId)
  if (!account) return jsonResponse({ error: 'reset_failed' }, 400)

  const raw = newToken()
  const { error: saveErr } = await db
    .from('guest_credentials')
    .upsert(
      {
        user_id: userId,
        reset_token_hash: await sha256Hex(raw),
        reset_expires_at: new Date(Date.now() + RESET_TTL_MIN * 60 * 1000).toISOString(),
        login_attempts: 0,
        locked_until: null,
      },
      { onConflict: 'user_id' },
    )
  if (saveErr) return jsonResponse({ error: 'reset_failed' }, 500)

  // 수신처는 요청 본문이 아니라 계정 원장에서 읽는다. 클라이언트가 수신처를 정할 수 있으면
  // 남의 재설정 링크를 자기 주소로 받을 수 있다.
  const to = account.email ?? account.phone ?? ''
  if (!to) return jsonResponse({ ok: false, notified: false, reason: 'no_contact' })

  const base = Deno.env.get('GUEST_APP_BASE_URL') ?? ''
  let notified = false
  try {
    const res = await sendNotification({
      channel: to.includes('@') ? 'EMAIL' : 'ALIMTALK',
      to,
      templateCode: 'GUEST_PASSWORD_RESET',
      variables: { name: account.name, link: `${base}/reset?token=${raw}`, minutes: String(RESET_TTL_MIN) },
    })
    notified = res.ok
  } catch (_e) {
    notified = false
  }

  // 발송 결과만 알린다. 토큰도, 연락처 원본도 호출자에게 돌려주지 않는다.
  return jsonResponse({ ok: true, notified })
}

async function handleConsume(resetToken: string): Promise<Response> {
  const db = supabaseAdmin()
  const hash = await sha256Hex(resetToken)

  const { data } = await db
    .from('guest_credentials')
    .select('user_id, reset_expires_at')
    .eq('reset_token_hash', hash)
    .maybeSingle()
  const row = data as { user_id: string; reset_expires_at: string | null } | null
  if (!row || !row.reset_expires_at || new Date(row.reset_expires_at).getTime() <= Date.now()) {
    return jsonResponse(INVALID, 401)
  }

  const account = await loadAccount(db, row.user_id)
  if (!account) return jsonResponse(INVALID, 401)

  // 링크를 한 번 쓰면 그 자리에서 죽인다. **비밀번호 해시는 비우지 않는다** — 비우면 그
  // 계정이 다시 초기 상태가 되어 원장 연락처가 비밀번호로 통하고, 사용자가 링크만 열고
  // 그만두면 그 상태로 남는다. 대신 티켓에 rst 표시를 달아 덮어쓸 권한을 준다.
  const { error } = await db
    .from('guest_credentials')
    .update({
      reset_token_hash: null,
      reset_expires_at: null,
      login_attempts: 0,
      locked_until: null,
    })
    .eq('user_id', row.user_id)
  if (error) return jsonResponse({ error: 'reset_failed' }, 500)

  return jsonResponse({
    changeTicket: await signChangeTicket(account.id, true),
    expiresInSec: CHANGE_TTL_SEC,
    name: account.name,
  })
}

Deno.serve(withCors(async (req: Request) => {
  if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405)

  try {
    const body = await req.json().catch(() => ({}))
    if (body?.resetToken) return await handleConsume(String(body.resetToken))
    if (body?.userId) return await handleSend(req, String(body.userId))
    return jsonResponse({ error: 'invalid_request' }, 400)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'internal_error'
    if (msg === 'jwt_secret_missing') return jsonResponse({ error: msg }, 500)
    return jsonResponse({ error: 'internal_error' }, 500)
  }
}))
