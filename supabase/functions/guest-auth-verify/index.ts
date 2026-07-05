// [Phase 3] 게스트 OTP 검증 → 커스텀 JWT 발급
// 요청: { name, contact, businessCode, otp }
// 응답: { accessToken, user } | 401 generic
import { corsHeaders, jsonResponse } from '../_shared/cors.ts'
import { sha256Hex, signJwt } from '../_shared/crypto.ts'
import { supabaseAdmin } from '../_shared/supabaseAdmin.ts'

const MAX_ATTEMPTS = 5
const JWT_TTL_SEC = 60 * 60 * 8 // 8시간
const DENIED = { error: 'auth_failed', message: '입력 정보가 일치하지 않거나 인증이 만료되었습니다.' }

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405)

  try {
    const { name, contact, businessCode, otp } = await req.json()
    if (!name || !contact || !businessCode || !otp) {
      return jsonResponse({ error: 'invalid_request' }, 400)
    }

    const db = supabaseAdmin()
    const { data: inv } = await db
      .from('guest_invitations')
      .select('id, invited_user_type, company_id, app_user_id, name, email, phone, otp_hash, otp_expires_at, otp_attempts')
      .eq('business_code', businessCode)
      .eq('name', name)
      .or(`email.eq.${contact},phone.eq.${contact}`)
      .gt('invite_expires_at', new Date().toISOString())
      .limit(1)
      .maybeSingle()

    if (!inv || !inv.otp_hash || !inv.otp_expires_at) return jsonResponse(DENIED, 401)
    if (new Date(inv.otp_expires_at).getTime() < Date.now()) return jsonResponse(DENIED, 401)
    if (inv.otp_attempts >= MAX_ATTEMPTS) return jsonResponse(DENIED, 401)

    const pepper = Deno.env.get('GUEST_JWT_SECRET') ?? ''
    const candidate = await sha256Hex(`${otp}:${businessCode}:${pepper}`)
    if (candidate !== inv.otp_hash) {
      await db
        .from('guest_invitations')
        .update({ otp_attempts: inv.otp_attempts + 1 })
        .eq('id', inv.id)
      return jsonResponse(DENIED, 401)
    }

    // 앱 사용자 확보(최초 인증 시 생성 + 게스트 권한 프로비저닝)
    let appUserId = inv.app_user_id as string | null
    if (!appUserId) {
      const { data: newUser, error: uErr } = await db
        .from('users')
        .insert({
          user_type: inv.invited_user_type,
          name: inv.name,
          email: inv.email,
          company_id: inv.company_id,
        })
        .select('id')
        .single()
      if (uErr || !newUser) return jsonResponse({ error: 'provision_failed' }, 500)
      appUserId = newUser.id

      // 게스트 권한 부여(유형별 템플릿 기준)
      const scope =
        inv.invited_user_type === 'external_startup'
          ? { permission_level: 'write', scope_type: 'company', scope_id: inv.company_id }
          : inv.invited_user_type === 'external_expert'
            ? { permission_level: 'write', scope_type: 'self', scope_id: null }
            : { permission_level: 'read', scope_type: 'temporary', scope_id: null }
      await db.from('workspace_permissions').insert({
        user_id: appUserId,
        workspace_key: 'guest',
        ...scope,
      })
    }

    await db
      .from('guest_invitations')
      .update({ app_user_id: appUserId, used_at: new Date().toISOString() })
      .eq('id', inv.id)

    const { data: appUser } = await db
      .from('users')
      .select('id, user_type, name, session_version, company_id')
      .eq('id', appUserId)
      .single()

    const nowSec = Math.floor(Date.now() / 1000)
    const token = await signJwt(
      {
        sub: appUserId,
        aud: 'authenticated',
        role: 'authenticated',
        app_user_id: appUserId,
        app_role: appUser?.user_type,
        session_version: appUser?.session_version ?? 1,
        iat: nowSec,
        exp: nowSec + JWT_TTL_SEC,
      },
      Deno.env.get('SUPABASE_JWT_SECRET') ?? '',
    )

    return jsonResponse({ accessToken: token, user: appUser })
  } catch (_e) {
    return jsonResponse({ error: 'internal_error' }, 500)
  }
})
