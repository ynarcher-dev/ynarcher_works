// 게스트 계정 — 로그인·맥락 전환·비밀번호가 공유하는 단일 창구.
//
// 종전 guestInvitation.ts를 대체한다. 축이 바뀌었기 때문이다: 자격증명이 **초대 행**
// (= 사업 × 사람)에 있던 것을 **계정**으로 올렸다. 초대 행에 두었을 때의 결함은 둘이었다 —
// 같은 사람이 두 사업에 걸리면 비밀번호가 두 벌이 되고, 새 사업에 초대되면 그 행의 해시가
// 비어 있어 전화번호로 다시 들어올 수 있었다. 잠금 카운터도 마찬가지로, 초대가 3건인
// 사람은 실질 잠금이 15회였다.
//
// 로그인은 이제 2요소(이메일 + 비밀번호)이며, **어느 사업으로 들어갈지는 로그인 이후에
// 고른다.** 막는 지점(app.guest_program_ids)은 그대로이고 고르는 방법만 바뀌었다.
//
// 근거: docs/docs_planning/3_9_1_guest_unified_account.md
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { signJwt } from './crypto.ts'
import { PROGRAM_LEDGERS, type ProgramEntityKey } from './programLedger.ts'

/** 세션 수명. 게스트는 하루 업무 단위로 들어오므로 8시간이면 충분하다. */
export const SESSION_TTL_SEC = 60 * 60 * 8

/** 맥락 선택 티켓 수명. 로그인 직후 목록에서 하나를 고르는 데 걸리는 시간이면 된다. */
export const SELECT_TTL_SEC = 60 * 10

/** 비밀번호 설정 티켓 수명(종전과 동일). */
export const CHANGE_TTL_SEC = 60 * 10

/** 명부에서 문이 열려 있다고 보는 상태. */
const OPEN_STATUSES = ['INVITED', 'ACTIVE']

/** 게스트가 진입할 수 없는 사업 상태(종료·취소). */
const DEAD_PROGRAM_STATUSES = new Set(['FINISHED', 'CANCELLED'])

const MAX_ATTEMPTS = 5
const LOCK_MINUTES = 15

export interface GuestAccount {
  id: string
  user_type: string
  name: string
  email: string | null
  phone: string | null
  company_id: string | null
  session_version: number
}

export interface GuestCredentials {
  user_id: string
  password_hash: string | null
  login_attempts: number
  locked_until: string | null
}

export interface GuestParticipation {
  participant_id: string
  program_id: string
  entity_key: ProgramEntityKey
  master_table: string | null
  master_id: string | null
  /**
   * 이 사업 게스트의 접근 종료(2026-09-05부터 **사업 원장**의 guest_access_ends_at).
   * 참여 줄이 아니라 사업이 갖는 값이라, 같은 사업의 두 줄은 같은 값을 본다.
   */
  access_ends_at: string | null
  code: string | null
  title: string
}

const ACCOUNT_COLS = 'id, user_type, name, email, phone, company_id, session_version'

/**
 * 이메일로 살아 있는 게스트 계정을 찾는다.
 *
 * **사용자 입력을 패턴 필터에 넣지 않는다.** PostgREST의 `.ilike()`는 `%`·`_`를 와일드카드로
 * 해석하므로, 입력을 그대로 이어 붙이면 필터의 뜻이 바뀐다. 대신 원문과 소문자 두 값으로
 * 정확 일치를 두 번 물어 표기 흔들림만 흡수한다(원장 이메일은 담당자가 입력한 값이라
 * 대소문자 외의 변형은 실질적으로 없다).
 */
export async function findAccountByEmail(
  db: SupabaseClient,
  email: string,
): Promise<GuestAccount | null> {
  const mail = String(email ?? '').trim()
  if (!mail) return null

  const candidates = mail === mail.toLowerCase() ? [mail] : [mail, mail.toLowerCase()]
  for (const value of candidates) {
    const { data } = await db
      .from('users')
      .select(ACCOUNT_COLS)
      .eq('email', value)
      .eq('is_active', true)
      .is('deleted_at', null)
      .in('user_type', ['external_startup', 'external_expert', 'temporary_guest'])
      .limit(2)
    const rows = (data ?? []) as GuestAccount[]
    // 이메일은 계정의 키이므로 원장(부분 유니크 인덱스)이 유일성을 강제한다. 그래도 둘이
    // 나오면 인덱스가 없거나 깨진 것이므로 조용히 하나를 고르지 않고 멈춘다 — 잘못 고르면
    // 남의 기록을 그 사람 것으로 만든다.
    if (rows.length === 1) return rows[0]
    if (rows.length > 1) return null
  }
  return null
}

/** 계정의 자격증명. 행이 없으면 만들어 돌려준다(초기 상태). */
export async function loadCredentials(
  db: SupabaseClient,
  userId: string,
): Promise<GuestCredentials> {
  const { data } = await db
    .from('guest_credentials')
    .select('user_id, password_hash, login_attempts, locked_until')
    .eq('user_id', userId)
    .maybeSingle()
  if (data) return data as GuestCredentials

  await db.from('guest_credentials').insert({ user_id: userId })
  return { user_id: userId, password_hash: null, login_attempts: 0, locked_until: null }
}

export function isLocked(cred: GuestCredentials): boolean {
  return Boolean(cred.locked_until && new Date(cred.locked_until).getTime() > Date.now())
}

/** 실패 1회 기록. 연속 5회면 15분 잠근다. 계정 단위여야 실질 잠금 횟수가 초대 수만큼 늘지 않는다. */
export async function recordFailure(db: SupabaseClient, cred: GuestCredentials): Promise<void> {
  const attempts = (cred.login_attempts ?? 0) + 1
  const patch: Record<string, unknown> = { login_attempts: attempts }
  if (attempts >= MAX_ATTEMPTS) {
    patch.locked_until = new Date(Date.now() + LOCK_MINUTES * 60 * 1000).toISOString()
    patch.login_attempts = 0
  }
  await db.from('guest_credentials').update(patch).eq('user_id', cred.user_id)
}

export async function clearFailures(db: SupabaseClient, userId: string): Promise<void> {
  await db
    .from('guest_credentials')
    .update({ login_attempts: 0, locked_until: null })
    .eq('user_id', userId)
}

/**
 * 이 계정이 지금 들어갈 수 있는 참여 목록.
 *
 * 조건은 RLS(app.guest_program_ids)와 같은 넷이되 **세션 고정 맥락만 빼고** 본다 —
 * 아직 맥락을 고르기 전에 부르는 목록이기 때문이다. 여기서 빠뜨린 조건이 있으면
 * 목록에는 뜨는데 들어가면 빈 화면이 되므로, 두 곳이 같은 규칙을 말해야 한다.
 */
export async function loadParticipations(
  db: SupabaseClient,
  userId: string,
): Promise<GuestParticipation[]> {
  const now = Date.now()
  const { data } = await db
    .from('program_participants')
    .select('id, program_id, entity_key, master_table, master_id')
    .eq('user_id', userId)
    .in('login_status', OPEN_STATUSES)

  const rows = (data ?? []) as {
    id: string
    program_id: string
    entity_key: string
    master_table: string | null
    master_id: string | null
  }[]
  if (rows.length === 0) return []

  // 사업 원장이 셋이라 entity_key로 갈라 한 번씩만 묻는다. 살아 있지 않은 사업은
  // 여기서 걸러지므로 목록에 뜨지 않는다.
  const byLedger = new Map<string, string[]>()
  for (const r of rows) {
    const table = PROGRAM_LEDGERS[r.entity_key as ProgramEntityKey]
    if (!table) continue
    byLedger.set(table, [...(byLedger.get(table) ?? []), r.program_id])
  }

  // 접근 기간은 **사업**이 갖는다(2026-09-05). 참여 줄마다 있던 시절에는 같은 사업의 스무
  // 줄이 저마다 값을 들고 있어 어긋날 수 있었다. 기간 판정은 코드에서 한다 — PostgREST의
  // `.or()`에 값을 문자열로 이어 붙이면 그 값의 표기(콜론·쉼표)가 필터 구조에 섞인다.
  const live = new Map<string, { code: string | null; title: string; accessEndsAt: string | null }>()
  for (const [table, ids] of byLedger) {
    const { data: progs } = await db
      .from(table)
      .select('id, code, title, status, deleted_at, guest_access_ends_at')
      .in('id', [...new Set(ids)])
    for (const p of (progs ?? []) as {
      id: string
      code: string | null
      title: string
      status: string
      deleted_at: string | null
      guest_access_ends_at: string | null
    }[]) {
      if (p.deleted_at || DEAD_PROGRAM_STATUSES.has(p.status)) continue
      if (p.guest_access_ends_at && new Date(p.guest_access_ends_at).getTime() <= now) continue
      live.set(p.id, { code: p.code, title: p.title, accessEndsAt: p.guest_access_ends_at })
    }
  }

  return rows
    .filter((r) => live.has(r.program_id) && PROGRAM_LEDGERS[r.entity_key as ProgramEntityKey])
    .map((r) => ({
      participant_id: r.id,
      program_id: r.program_id,
      entity_key: r.entity_key as ProgramEntityKey,
      master_table: r.master_table,
      master_id: r.master_id,
      access_ends_at: live.get(r.program_id)!.accessEndsAt,
      code: live.get(r.program_id)!.code,
      title: live.get(r.program_id)!.title,
    }))
    .sort((a, b) => a.title.localeCompare(b.title, 'ko'))
}

/**
 * 원장에서 지금 연락처를 읽는다. 초기 비밀번호 판정에 쓴다.
 *
 * 계정의 `users.phone`은 발급 시점의 복사본이라, 담당자가 NETWORKS에서 연락처를 고쳐도
 * 낡은 채로 남는다. 초기 비밀번호는 "참여자가 이미 가지고 있는 값"이어야 성립하므로
 * 정본인 원장을 읽는다(이름의 정본이 원장인 것과 같은 원리).
 */
export async function readLedgerPhones(
  db: SupabaseClient,
  account: GuestAccount,
): Promise<string[]> {
  const { data: rows } = await db
    .from('guest_identities')
    .select('master_table, master_id')
    .eq('user_id', account.id)
  const identities = (rows ?? []) as { master_table: string; master_id: string }[]

  // 인격이 둘일 수 있으므로(참가기업 + 참가전문가) 어느 쪽 연락처든 통하게 한다. 이 값이
  // 쓰이는 시점은 계정에 비밀번호가 아직 없을 때뿐이고, 그때 참여자가 손에 쥔 것은 자기
  // 연락처다 — 어느 인격으로 등록됐는지까지 맞히라고 요구할 일이 아니다.
  const phones: string[] = []
  const startupIds = identities.filter((i) => i.master_table === 'startups').map((i) => i.master_id)
  const networkIds = identities.filter((i) => i.master_table === 'networks').map((i) => i.master_id)

  if (startupIds.length > 0) {
    const { data } = await db.from('startups').select('contact').in('id', startupIds)
    for (const row of (data ?? []) as { contact: Record<string, string> | null }[]) {
      if (row.contact?.phone) phones.push(row.contact.phone)
    }
  }
  if (networkIds.length > 0) {
    const { data } = await db.from('networks').select('phone').in('id', networkIds)
    for (const row of (data ?? []) as { phone: string | null }[]) {
      if (row.phone) phones.push(row.phone)
    }
  }
  // 계정의 복사본은 마지막 폴백이다 — 원장이 정본이지만, 인격 매핑이 아직 없는 계정
  // (temporary_guest 등)은 이 값밖에 없다.
  if (account.phone) phones.push(account.phone)
  return [...new Set(phones)]
}

export interface GuestSessionPayload {
  accessToken: string
  user: {
    id: string
    user_type: string
    name: string
    email: string | null
    company_id: string | null
  }
  context: {
    participant_id: string
    program_id: string
    entity_key: string
    code: string | null
    title: string
    /** 이 맥락의 자격 — startups(참가기업) | networks(참가전문가). 화면을 가르는 축이다. */
    persona: string | null
    access_ends_at: string | null
  }
}

function requireSecret(): string {
  const secret = Deno.env.get('GUEST_JWT_SECRET') ?? ''
  // 서명 키가 없으면 토큰은 발급되어도 PostgREST가 거절한다 — 조용히 나가면
  // "로그인은 됐는데 아무것도 안 보이는" 증상으로 나타나므로 여기서 멈춘다.
  if (!secret) throw new Error('jwt_secret_missing')
  return secret
}

/**
 * 고른 맥락 하나로 세션을 발급한다.
 *
 * 토큰에는 `context_type`+`context_id`를 싣는다 — FUND가 들어올 때 클레임이 하나 더
 * 생기면 판정 함수가 두 벌로 갈라지기 때문이다. 옛 `program_id`도 함께 실어 배포 유예를
 * 둔다(새 함수가 배포되기 전의 구 판정 경로가 그것을 읽는다).
 */
export async function issueSession(
  db: SupabaseClient,
  account: GuestAccount,
  participation: GuestParticipation,
): Promise<GuestSessionPayload> {
  const secret = requireSecret()
  const nowSec = Math.floor(Date.now() / 1000)

  // 실제로 들어온 순간을 명부에 기록한다(개방 시점의 INVITED → ACTIVE).
  await db
    .from('program_participants')
    .update({
      login_status: 'ACTIVE',
      joined_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', participation.participant_id)
    .neq('login_status', 'ACTIVE')

  await db
    .from('guest_invitations')
    .update({ used_at: new Date().toISOString(), app_user_id: account.id })
    .eq('participant_id', participation.participant_id)

  const accessToken = await signJwt(
    {
      sub: account.id,
      aud: 'authenticated',
      role: 'authenticated',
      app_user_id: account.id,
      app_role: account.user_type,
      session_version: account.session_version ?? 1,
      context_type: participation.entity_key,
      context_id: participation.program_id,
      // 배포 유예용 호환 클레임. 새 판정 함수는 context_*를 먼저 본다.
      program_id: participation.program_id,
      iat: nowSec,
      exp: nowSec + SESSION_TTL_SEC,
    },
    secret,
  )

  return {
    accessToken,
    user: {
      id: account.id,
      user_type: account.user_type,
      name: account.name,
      email: account.email,
      company_id: account.company_id,
    },
    context: {
      participant_id: participation.participant_id,
      program_id: participation.program_id,
      entity_key: participation.entity_key,
      code: participation.code,
      title: participation.title,
      persona: participation.master_table,
      access_ends_at: participation.access_ends_at,
    },
  }
}

/** 참여가 둘 이상일 때 주는 선택 티켓. 데이터 접근 권한이 없다. */
export async function signSelectTicket(userId: string): Promise<string> {
  const nowSec = Math.floor(Date.now() / 1000)
  return await signJwt(
    { sub: userId, aud: 'guest-context-select', iat: nowSec, exp: nowSec + SELECT_TTL_SEC },
    requireSecret(),
  )
}

/**
 * 비밀번호 설정 티켓. 초기 비밀번호로 확인된 직후, 또는 재설정 링크를 소진한 직후에만 발급한다.
 *
 * `rst`는 "이미 비밀번호가 있어도 덮어쓴다"는 표시다. 재설정 경로에서 저장된 해시를 미리
 * 비우지 않기 위해 필요하다 — 비워 두면 그 계정이 다시 **초기 상태**가 되어 원장 연락처가
 * 비밀번호로 통하게 되고, 사용자가 링크를 열어 놓고 그만두면 그 상태로 남는다.
 */
export async function signChangeTicket(userId: string, isReset = false): Promise<string> {
  const nowSec = Math.floor(Date.now() / 1000)
  return await signJwt(
    {
      sub: userId,
      aud: 'guest-password-change',
      rst: isReset,
      iat: nowSec,
      exp: nowSec + CHANGE_TTL_SEC,
    },
    requireSecret(),
  )
}

/** 계정 한 건을 id로 읽는다(티켓 회수 경로). 정지·삭제된 계정은 null이다. */
export async function loadAccount(
  db: SupabaseClient,
  userId: string,
): Promise<GuestAccount | null> {
  const { data } = await db
    .from('users')
    .select(ACCOUNT_COLS + ', is_active, deleted_at')
    .eq('id', userId)
    .maybeSingle()
  const row = data as (GuestAccount & { is_active: boolean; deleted_at: string | null }) | null
  if (!row || !row.is_active || row.deleted_at) return null
  const { is_active: _a, deleted_at: _d, ...account } = row
  return account
}

/** 목록 응답용 축약형(비밀번호·연락처를 싣지 않는다). */
export function toChoice(p: GuestParticipation) {
  return {
    participantId: p.participant_id,
    programId: p.program_id,
    entityKey: p.entity_key,
    code: p.code,
    title: p.title,
    persona: p.master_table,
    accessEndsAt: p.access_ends_at,
  }
}
