// 게스트 초대 조회와 세션 발급 — 로그인(guest-auth-login)과 비밀번호 설정(guest-auth-password)이 공유한다.
//
// 로그인 3요소는 사업코드 + 이메일(ID) + 비밀번호다. 여기에 더해 "지금 이 문이 열려 있는가"를
// 명부에서 되묻는다 — 초대 레코드가 남아 있어도 담당자가 닫았거나 사업이 끝났으면 진입할 수 없다.
//
// 대조를 SQL 필터가 아니라 코드에서 하는 이유: PostgREST의 `.or()`·`.eq()`에 사용자 입력을
// 그대로 이어 붙이면 쉼표·괄호가 필터 구조를 바꿀 수 있다. 사업코드로만 좁혀 온 뒤 나머지는
// 값 비교로 판정한다.

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { signJwt } from './crypto.ts'

/** 명부에서 문이 열려 있다고 보는 상태. */
const OPEN_STATUSES = new Set(['INVITED', 'ACTIVE'])

/** 게스트가 진입할 수 없는 사업 상태(종료·취소). */
const DEAD_PROGRAM_STATUSES = new Set(['FINISHED', 'CANCELLED'])

/** 세션 수명. 게스트는 하루 업무 단위로 들어오므로 8시간이면 충분하다. */
export const SESSION_TTL_SEC = 60 * 60 * 8

export interface GuestInvitation {
  id: string
  invited_user_type: string
  company_id: string | null
  app_user_id: string | null
  name: string
  email: string | null
  phone: string | null
  participant_id: string | null
  password_hash: string | null
  password_set_at: string | null
  login_attempts: number
  locked_until: string | null
}

export interface GuestParticipant {
  id: string
  program_id: string
  role: string
  user_id: string | null
  login_status: string
}

export interface GuestMatch {
  invitation: GuestInvitation
  participant: GuestParticipant
}

const INVITATION_COLS =
  'id, invited_user_type, company_id, app_user_id, name, email, phone, participant_id, ' +
  'password_hash, password_set_at, login_attempts, locked_until'

/** 사업코드 표기 흔들림 흡수(공백·대소문자). programs.code는 6자리 영숫자다. */
export function normalizeCode(raw: unknown): string {
  return String(raw ?? '').trim().toUpperCase()
}

function sameEmail(a: string | null, b: string): boolean {
  if (!a) return false
  return a.trim().toLowerCase() === b.trim().toLowerCase()
}

/**
 * 사업코드 + 이메일로 열려 있는 초대를 찾는다. 하나라도 어긋나면 null이다.
 * 호출부는 null을 사유 구분 없이 같은 응답으로 처리해 계정 열거를 막는다.
 */
export async function findOpenInvitation(
  db: SupabaseClient,
  businessCode: string,
  email: string,
): Promise<GuestMatch | null> {
  const code = normalizeCode(businessCode)
  const mail = String(email ?? '').trim()
  if (!code || !mail) return null

  const { data: rows } = await db
    .from('guest_invitations')
    .select(INVITATION_COLS)
    .eq('business_code', code)
    .gt('invite_expires_at', new Date().toISOString())
    .limit(200)

  const invitation = ((rows ?? []) as GuestInvitation[]).find((r) => sameEmail(r.email, mail))
  if (!invitation || !invitation.participant_id) return null

  // 명부 행이 곧 권한이다. 초대 레코드만 남고 문이 닫힌 경우를 여기서 거른다.
  const { data: participant } = await db
    .from('program_participants')
    .select('id, program_id, role, user_id, login_status')
    .eq('id', invitation.participant_id)
    .maybeSingle()

  const p = participant as GuestParticipant | null
  if (!p || !OPEN_STATUSES.has(p.login_status)) return null

  const { data: program } = await db
    .from('programs')
    .select('id, status, deleted_at')
    .eq('id', p.program_id)
    .maybeSingle()

  const prog = program as { status: string; deleted_at: string | null } | null
  if (!prog || prog.deleted_at || DEAD_PROGRAM_STATUSES.has(prog.status)) return null

  return { invitation, participant: p }
}

/** 초대 레코드로 초대를 다시 읽는다(비밀번호 설정 티켓 회수 경로). */
export async function loadInvitation(
  db: SupabaseClient,
  invitationId: string,
): Promise<GuestMatch | null> {
  const { data } = await db
    .from('guest_invitations')
    .select(INVITATION_COLS)
    .eq('id', invitationId)
    .maybeSingle()

  const invitation = data as GuestInvitation | null
  if (!invitation || !invitation.participant_id) return null

  const { data: participant } = await db
    .from('program_participants')
    .select('id, program_id, role, user_id, login_status')
    .eq('id', invitation.participant_id)
    .maybeSingle()

  const p = participant as GuestParticipant | null
  if (!p || !OPEN_STATUSES.has(p.login_status)) return null
  return { invitation, participant: p }
}

/** 로그인 실패 1회 기록. 연속 5회면 15분 잠근다. */
export async function recordFailure(db: SupabaseClient, inv: GuestInvitation): Promise<void> {
  const attempts = (inv.login_attempts ?? 0) + 1
  const patch: Record<string, unknown> = { login_attempts: attempts }
  if (attempts >= 5) {
    patch.locked_until = new Date(Date.now() + 15 * 60 * 1000).toISOString()
    patch.login_attempts = 0
  }
  await db.from('guest_invitations').update(patch).eq('id', inv.id)
}

/** 잠금 중인가. */
export function isLocked(inv: GuestInvitation): boolean {
  return Boolean(inv.locked_until && new Date(inv.locked_until).getTime() > Date.now())
}

export interface GuestSession {
  accessToken: string
  user: { id: string; user_type: string; name: string; company_id: string | null } | null
  program: { id: string; title: string; code: string | null } | null
}

/**
 * 로그인 성공 뒤의 공통 처리 — 계정 확보 → 명부 행에 계정 연결 → 세션 토큰 발급.
 *
 * 명부 행에 계정을 되붙이는 것이 핵심이다. 이 연결이 없으면 게스트 조회 범위의 판정 기준이
 * 빈 채로 남아, 로그인은 되는데 화면만 비는 증상이 난다.
 * 토큰에는 program_id를 실어 세션에 사업을 고정한다 — 코드가 곧 사업이므로 다른 사업은
 * 그 사업의 코드로 다시 들어와야 한다.
 */
export async function issueGuestSession(
  db: SupabaseClient,
  match: GuestMatch,
): Promise<GuestSession> {
  const { invitation: inv, participant } = match
  const nowIso = new Date().toISOString()

  let appUserId = inv.app_user_id
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
    if (uErr || !newUser) throw new Error('provision_failed')
    appUserId = newUser.id as string

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
    .update({ app_user_id: appUserId, used_at: nowIso, login_attempts: 0, locked_until: null })
    .eq('id', inv.id)

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
  if (linkErr) throw new Error('provision_failed')

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

  const secret = Deno.env.get('SUPABASE_JWT_SECRET') ?? ''
  if (!secret) {
    // 서명 키가 없으면 토큰은 발급되어도 PostgREST가 거절한다 — 조용히 나가면
    // "로그인은 됐는데 아무것도 안 보이는" 증상으로 나타나므로 여기서 멈춘다.
    throw new Error('jwt_secret_missing')
  }

  const nowSec = Math.floor(Date.now() / 1000)
  const accessToken = await signJwt(
    {
      sub: appUserId,
      aud: 'authenticated',
      role: 'authenticated',
      app_user_id: appUserId,
      app_role: (appUser as { user_type?: string } | null)?.user_type,
      session_version: (appUser as { session_version?: number } | null)?.session_version ?? 1,
      program_id: participant.program_id,
      program_role: participant.role,
      iat: nowSec,
      exp: nowSec + SESSION_TTL_SEC,
    },
    secret,
  )

  return {
    accessToken,
    user: (appUser ?? null) as GuestSession['user'],
    program: (program ?? null) as GuestSession['program'],
  }
}
