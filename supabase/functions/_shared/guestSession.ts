// 로그인 이후의 게스트 세션 검증 — 새로고침(guest-auth-refresh)과 비밀번호
// 변경(guest-auth-password의 변경 모드)이 공유한다.
//
// 세션 JWT만 믿지 않고 매번 DB에 되묻는다: session_version이 어긋났으면(담당자가 접근을
// 닫아 판을 올린 경우) 토큰이 살아 있어도 거절한다 — RLS 헬퍼(current_app_user_id)와
// 같은 판정을 Edge Function에서도 유지해야 "표는 막혔는데 함수는 열린" 틈이 안 생긴다.

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { verifyJwt } from './crypto.ts'

export interface GuestSessionUser {
  id: string
  user_type: string
  name: string
  email: string | null
  session_version: number
}

export interface VerifiedGuestSession {
  user: GuestSessionUser
  programId: string
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
  const programId = typeof claims.program_id === 'string' ? claims.program_id : null
  if (!appUserId || !programId) return null

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
  return { user, programId }
}

export interface GuestParticipation {
  id: string
  role: string
  joined_at: string | null
  master_table: string | null
  master_id: string | null
}

/** 이 세션(사업 × 계정)의 열린 명부 행. 문이 닫혔으면 빈 배열이다. */
export async function loadOpenParticipations(
  db: SupabaseClient,
  programId: string,
  userId: string,
): Promise<GuestParticipation[]> {
  const { data } = await db
    .from('program_participants')
    .select('id, role, joined_at, master_table, master_id, login_status')
    .eq('program_id', programId)
    .eq('user_id', userId)
    .in('login_status', ['INVITED', 'ACTIVE'])
  return ((data ?? []) as (GuestParticipation & { login_status: string })[]).map(
    ({ login_status: _s, ...p }) => p,
  )
}

export interface LedgerIdentity {
  /** 로그인 인격의 현재 이름(기업이면 대표자, 전문가면 본인). 원장에 없으면 null. */
  name: string | null
  /** 소속 기업명(기업 참여자만). */
  companyName: string | null
}

/**
 * 명부가 가리키는 원장(NETWORKS 기업·전문가)에서 지금 이름을 읽는다.
 *
 * 게스트 계정(users.name)은 최초 로그인 때 초대장의 복사본으로 만들어지는데, 초대장 자체가
 * 접근 개설 시점의 복사본이라 WORKS에서 원장을 고치면 두 겹이 함께 낡는다. 이름의 정본은
 * 언제나 원장이므로(participantHooks.ts와 같은 원칙) 세션 쪽이 원장을 다시 읽어 와야 한다.
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
