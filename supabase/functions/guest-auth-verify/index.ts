// [Phase 3] 게스트 OTP 검증 → 커스텀 JWT 발급
// 요청: { name, contact, businessCode, otp }
// 응답: { accessToken, user, program } | 401 generic
//
// 2026-08-27 개편
//   · 진입 판정을 연동 DB 명부와 묶었다(_shared/guestInvitation.ts) — 초대 레코드가 남아
//     있어도 담당자가 닫았거나 사업이 끝났으면 통과하지 못한다.
//   · 검증 성공 시 명부 행에 계정을 되붙인다(user_id·joined_at·login_status=ACTIVE).
//     이 연결이 없으면 게스트 조회 범위의 판정 기준이 빈 채로 남아, 로그인은 되는데
//     화면만 비는 증상이 난다.
//   · 토큰에 program_id를 실어 세션에 사업을 고정한다 — 코드가 곧 사업이므로 다른 사업은
//     그 사업의 코드로 다시 들어와야 한다.
import { jsonResponse, withCors } from '../_shared/cors.ts'
import { sha256Hex, signJwt } from '../_shared/crypto.ts'
import { findOpenInvitation, normalizeCode } from '../_shared/guestInvitation.ts'
import { supabaseAdmin } from '../_shared/supabaseAdmin.ts'

const MAX_ATTEMPTS = 5
const JWT_TTL_SEC = 60 * 60 * 8 // 8시간
const DENIED = { error: 'auth_failed', message: '입력 정보가 일치하지 않거나 인증이 만료되었습니다.' }

Deno.serve(withCors(async (req: Request) => {
  if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405)

  try {
    const { name, contact, businessCode, otp } = await req.json()
    if (!name || !contact || !businessCode || !otp) {
      return jsonResponse({ error: 'invalid_request' }, 400)
    }

    const db = supabaseAdmin()
    const match = await findOpenInvitation(db, businessCode, name, contact)
    if (!match) return jsonResponse(DENIED, 401)

    const inv = match.invitation
    const participant = match.participant

    if (!inv.otp_hash || !inv.otp_expires_at) return jsonResponse(DENIED, 401)
    if (new Date(inv.otp_expires_at).getTime() < Date.now()) return jsonResponse(DENIED, 401)
    if (inv.otp_attempts >= MAX_ATTEMPTS) return jsonResponse(DENIED, 401)

    const pepper = Deno.env.get('GUEST_JWT_SECRET') ?? ''
    const candidate = await sha256Hex(`${otp}:${normalizeCode(businessCode)}:${pepper}`)
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

    const nowIso = new Date().toISOString()

    await db
      .from('guest_invitations')
      .update({ app_user_id: appUserId, used_at: nowIso })
      .eq('id', inv.id)

    // 명부 행에 계정을 되붙인다. 이 연결이 게스트가 무엇을 볼 수 있는지의 유일한 근거다.
    // joined_at은 최초 진입 시각이라 재로그인으로 덮어쓰지 않는다.
    const linkPatch: Record<string, unknown> = {
      user_id: appUserId,
      login_status: 'ACTIVE',
      updated_at: nowIso,
    }
    if (!participant.user_id) linkPatch.joined_at = nowIso

    const { error: linkErr } = await db
      .from('program_participants')
      .update(linkPatch)
      .eq('id', participant.id)
    if (linkErr) return jsonResponse({ error: 'provision_failed' }, 500)

    const { data: appUser } = await db
      .from('users')
      .select('id, user_type, name, session_version, company_id')
      .eq('id', appUserId)
      .single()

    const { data: program } = await db
      .from('programs')
      .select('id, title, code')
      .eq('id', participant.program_id)
      .maybeSingle()

    const nowSec = Math.floor(Date.now() / 1000)
    const token = await signJwt(
      {
        sub: appUserId,
        aud: 'authenticated',
        role: 'authenticated',
        app_user_id: appUserId,
        app_role: appUser?.user_type,
        session_version: appUser?.session_version ?? 1,
        // 세션에 고정되는 사업. RLS(app.guest_session_program_id)가 이 값으로 범위를 자른다.
        program_id: participant.program_id,
        program_role: participant.role,
        iat: nowSec,
        exp: nowSec + JWT_TTL_SEC,
      },
      Deno.env.get('SUPABASE_JWT_SECRET') ?? '',
    )

    return jsonResponse({ accessToken: token, user: appUser, program })
  } catch (_e) {
    return jsonResponse({ error: 'internal_error' }, 500)
  }
}))
