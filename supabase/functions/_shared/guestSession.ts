// 로그인 이후의 게스트 세션 검증 — 새로고침(guest-auth-refresh), 맥락 전환
// (guest-auth-context), 비밀번호 변경(guest-auth-password)이 공유한다.
//
// 세션 JWT만 믿지 않고 매번 DB에 되묻는다: session_version이 어긋났으면(담당자가 접근을
// 닫아 판을 올린 경우) 토큰이 살아 있어도 거절한다 — RLS 헬퍼(current_app_user_id)와
// 같은 판정을 Edge Function에서도 유지해야 "표는 막혔는데 함수는 열린" 틈이 안 생긴다.

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { verifyJwt } from './crypto.ts'

/** 사업 맥락으로 인정하는 종류. 장래의 fund 맥락은 여기 들지 않는다. */
const PROGRAM_CONTEXTS = new Set(['program', 'ma_program', 'project_program'])

export interface GuestSessionUser {
  id: string
  user_type: string
  name: string
  email: string | null
  session_version: number
}

export interface VerifiedGuestSession {
  user: GuestSessionUser
  /** 세션에 고정된 사업. 사업이 아닌 맥락(장래 fund 등)이면 null이다. */
  programId: string | null
  contextType: string
}

/** Authorization 헤더의 세션 JWT를 검증하고 살아 있는 계정인지 DB로 확인한다. 실패는 null. */
export async function verifyGuestSession(
  db: SupabaseClient,
  req: Request,
): Promise<VerifiedGuestSession | null> {
  const secret = Deno.env.get('GUEST_JWT_SECRET') ?? ''
  if (!secret) throw new Error('jwt_secret_missing')

  const auth = req.headers.get('authorization') ?? ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  const claims = await verifyJwt(token, secret, 'authenticated')
  if (!claims) return null

  const appUserId = typeof claims.app_user_id === 'string' ? claims.app_user_id : null
  if (!appUserId) return null

  // 맥락 클레임은 (종류, 대상) 쌍이다. 종류가 없는 구 토큰은 사업 맥락으로 읽는다 —
  // 세션 수명이 8시간이라 배포 직후 살아 있는 토큰이 여기로 들어온다. 폴백이 없으면
  // 배포 순간 접속 중인 게스트가 전원 튕긴다.
  const rawType = typeof claims.context_type === 'string' ? claims.context_type : ''
  const contextType = rawType || 'program'
  const contextId =
    (typeof claims.context_id === 'string' ? claims.context_id : '') ||
    (typeof claims.program_id === 'string' ? claims.program_id : '')
  if (!contextId) return null

  const { data } = await db
    .from('users')
    .select('id, user_type, name, email, session_version, is_active, deleted_at')
    .eq('id', appUserId)
    .maybeSingle()

  const row = data as
    | (GuestSessionUser & { is_active: boolean; deleted_at: string | null })
    | null
  if (!row || !row.is_active || row.deleted_at) return null
  if ((row.session_version ?? 1) !== (claims.session_version ?? 1)) return null

  const { is_active: _a, deleted_at: _d, ...user } = row
  return {
    user,
    programId: PROGRAM_CONTEXTS.has(contextType) ? contextId : null,
    contextType,
  }
}

export interface GuestParticipation {
  id: string
  role: string
  joined_at: string | null
  master_table: string | null
  master_id: string | null
}

/**
 * 이 세션(사업 × 계정)의 열린 명부 행. 문이 닫혔거나 **접근 기간이 지났으면** 빈 배열이다.
 * 조건을 RLS(app.guest_program_ids)와 같게 유지해야 "함수는 통과하는데 표는 비는" 틈이
 * 생기지 않는다.
 */
export async function loadOpenParticipations(
  db: SupabaseClient,
  programId: string,
  userId: string,
): Promise<GuestParticipation[]> {
  const now = Date.now()
  const { data } = await db
    .from('program_participants')
    .select('id, role, joined_at, master_table, master_id, login_status, access_starts_at, access_ends_at')
    .eq('program_id', programId)
    .eq('user_id', userId)
    .in('login_status', ['INVITED', 'ACTIVE'])
  return ((data ?? []) as (GuestParticipation & {
    login_status: string
    access_starts_at: string | null
    access_ends_at: string | null
  })[])
    .filter(
      (p) =>
        (!p.access_starts_at || new Date(p.access_starts_at).getTime() <= now) &&
        (!p.access_ends_at || new Date(p.access_ends_at).getTime() > now),
    )
    .map(({ login_status: _s, access_starts_at: _st, access_ends_at: _e, ...p }) => p)
}

export interface LedgerIdentity {
  /** 로그인 인격의 현재 이름(기업이면 대표자, 전문가면 본인). 원장에 없으면 null. */
  name: string | null
  /** 소속 기업명(기업 참여자만). */
  companyName: string | null
}

/**
 * 명부가 가리키는 원장(기업·통합 네트워크)에서 지금 이름을 읽는다.
 *
 * 게스트 계정(users.name)은 발급 시점의 원장 복사본이라, WORKS에서 원장을 고치면 낡는다.
 * 이름의 정본은 언제나 원장이므로 세션 쪽이 원장을 다시 읽어 와야 한다.
 */
export async function readLedgerIdentity(
  db: SupabaseClient,
  p: GuestParticipation | undefined,
): Promise<LedgerIdentity> {
  if (!p?.master_table || !p.master_id) return { name: null, companyName: null }
  if (p.master_table === 'startups') {
    const { data } = await db
      .from('startups')
      .select('name, representative')
      .eq('id', p.master_id)
      .maybeSingle()
    const row = data as { name: string | null; representative: string | null } | null
    return { name: row?.representative ?? null, companyName: row?.name ?? null }
  }
  // 2026-09-04 원장 통합: 종전 'experts'는 통합 원장 networks가 되었다. 명부에 남아 있는
  // 옛 값도 같은 표를 가리키므로 함께 받아 준다(이관이 id를 보존해 행은 그대로다).
  if (p.master_table === 'networks' || p.master_table === 'experts') {
    const { data } = await db
      .from('networks')
      .select('name')
      .eq('id', p.master_id)
      .maybeSingle()
    return { name: (data as { name: string | null } | null)?.name ?? null, companyName: null }
  }
  return { name: null, companyName: null }
}

/**
 * 원장 이름이 계정·초대장의 복사본과 다르면 복사본을 원장 값으로 바로잡는다.
 * 돌려주는 값은 화면에 보여줄 최종 이름이다.
 */
export async function syncGuestName(
  db: SupabaseClient,
  user: GuestSessionUser,
  participations: GuestParticipation[],
  ledgerName: string | null,
): Promise<string> {
  if (!ledgerName || ledgerName === user.name) return user.name
  await db.from('users').update({ name: ledgerName }).eq('id', user.id)
  const participantIds = participations.map((p) => p.id)
  if (participantIds.length > 0) {
    await db
      .from('guest_invitations')
      .update({ name: ledgerName })
      .in('participant_id', participantIds)
  }
  return ledgerName
}
