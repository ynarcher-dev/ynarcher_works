// [Phase 7] 임직원 계정 생성 (관리자/경영지원 전용)
// 요청: { email, name, password, user_type, department_id?, phone?, position? }
// 응답: { id } | 4xx/5xx
//
// 보안:
// - service_role로 auth 계정을 생성하므로 반드시 호출자 권한(super_admin 또는
//   management write)을 서버에서 먼저 검증한다. (UI 숨김 ≠ 보안)
// - auth.users 생성 → public.users 행 연결 → 권한 템플릿 프로비저닝 → 감사 로그.
//   users 행 생성 실패 시 방금 만든 auth 계정을 삭제(롤백)한다.
// 근거: docs/docs_dev/11_migration_security_gate.md,
//       supabase/functions/guest-auth-verify/index.ts(프로비저닝 패턴)
import { corsHeaders, jsonResponse } from '../_shared/cors.ts'
import { supabaseAdmin } from '../_shared/supabaseAdmin.ts'

/** 계정 생성 시 부여 가능한 임직원 역할(외부 게스트 유형은 제외). */
const INTERNAL_ROLES = new Set([
  'super_admin',
  'executive',
  'management_support',
  'fund_manager',
  'ac_business',
  'mna_manager',
  'project_manager',
  'read_only',
])

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405)

  try {
    const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
    if (!token) return jsonResponse({ error: 'unauthorized' }, 401)

    const body = await req.json()
    const email = String(body.email ?? '').trim().toLowerCase()
    const name = String(body.name ?? '').trim()
    const password = String(body.password ?? '')
    const userType = String(body.user_type ?? '').trim()
    const departmentId = body.department_id ? String(body.department_id) : null
    const phone = body.phone ? String(body.phone).trim() : null
    const position = body.position ? String(body.position).trim() : null
    const rank = body.rank ? String(body.rank).trim() : null
    const payStep = body.pay_step ? String(body.pay_step).trim() : null

    if (!email || !name || !password) {
      return jsonResponse({ error: 'invalid_request', message: '이메일·이름·비밀번호는 필수입니다.' }, 400)
    }
    if (password.length < 8) {
      return jsonResponse({ error: 'weak_password', message: '초기 비밀번호는 8자 이상이어야 합니다.' }, 400)
    }
    if (!INTERNAL_ROLES.has(userType)) {
      return jsonResponse({ error: 'invalid_role', message: '유효한 역할을 선택하세요.' }, 400)
    }

    const db = supabaseAdmin()

    // 1) 호출자 인증 + 권한 검증 -------------------------------------------------
    const { data: authData, error: authErr } = await db.auth.getUser(token)
    if (authErr || !authData.user) return jsonResponse({ error: 'unauthorized' }, 401)

    const { data: caller } = await db
      .from('users')
      .select('id, user_type')
      .eq('auth_user_id', authData.user.id)
      .is('deleted_at', null)
      .maybeSingle()
    if (!caller) return jsonResponse({ error: 'forbidden' }, 403)

    let canManage = caller.user_type === 'super_admin'
    if (!canManage) {
      const { data: perm } = await db
        .from('workspace_permissions')
        .select('permission_level, expires_at')
        .eq('user_id', caller.id)
        .eq('workspace_key', 'management')
        .maybeSingle()
      const active = perm && (!perm.expires_at || new Date(perm.expires_at).getTime() > Date.now())
      canManage = Boolean(active && perm.permission_level === 'write')
    }
    if (!canManage) return jsonResponse({ error: 'forbidden', message: '계정 생성 권한이 없습니다.' }, 403)

    // 2) auth 계정 생성(초기 비밀번호로 즉시 로그인 가능) -------------------------
    const { data: createdAuth, error: createErr } = await db.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })
    if (createErr || !createdAuth.user) {
      const dup = /already|exists|registered/i.test(createErr?.message ?? '')
      return jsonResponse(
        { error: dup ? 'email_exists' : 'create_failed', message: dup ? '이미 사용 중인 이메일입니다.' : '계정 생성에 실패했습니다.' },
        dup ? 409 : 500,
      )
    }
    const authUserId = createdAuth.user.id

    // 3) public.users 행 생성(auth 연결). 실패 시 auth 계정 롤백. -----------------
    const profile: Record<string, unknown> = {}
    if (position) profile.position = position
    if (rank) profile.rank = rank
    if (payStep) profile.pay_step = payStep

    const { data: newUser, error: insErr } = await db
      .from('users')
      .insert({
        auth_user_id: authUserId,
        user_type: userType,
        name,
        email,
        department_id: departmentId,
        phone,
        profile,
      })
      .select('id')
      .single()
    if (insErr || !newUser) {
      await db.auth.admin.deleteUser(authUserId)
      return jsonResponse({ error: 'provision_failed', message: '계정 레코드 생성에 실패했습니다.' }, 500)
    }

    // 4) 권한 템플릿 프로비저닝(유형별 기본 매트릭스) -----------------------------
    const { data: tpls } = await db
      .from('permission_templates')
      .select('workspace_key, permission_level, scope_type')
      .eq('user_type', userType)
    if (tpls && tpls.length > 0) {
      await db.from('workspace_permissions').insert(
        tpls.map((t) => ({
          user_id: newUser.id,
          workspace_key: t.workspace_key,
          permission_level: t.permission_level,
          scope_type: t.scope_type,
        })),
      )
    }

    // 5) 감사 로그(계정 생성). audit_logs 직접 INSERT는 RLS 차단이나 service_role은 통과.
    await db.from('audit_logs').insert({
      actor_user_id: caller.id,
      target_user_id: newUser.id,
      action: 'ACCOUNT_CREATE',
      changed_workspace: 'management',
      after_data: { email, name, user_type: userType },
    })

    return jsonResponse({ id: newUser.id })
  } catch (_e) {
    return jsonResponse({ error: 'internal_error' }, 500)
  }
})
