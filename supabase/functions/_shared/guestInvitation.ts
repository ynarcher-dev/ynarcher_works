// 게스트 초대 조회 — OTP 발급(guest-auth-request)과 검증(guest-auth-verify)이 공유한다.
//
// 로그인은 세 값이 모두 맞을 때만 성립한다: 사업코드 + 성명 + 연락처(이메일 또는 전화).
// 여기에 더해 "지금 이 문이 열려 있는가"를 명부에서 되묻는다 — 초대 레코드가 남아 있어도
// 담당자가 닫았거나 사업이 끝났으면 진입할 수 없다. 두 함수가 같은 판정을 쓰지 않으면
// 인증번호는 나가는데 로그인은 안 되는(또는 그 반대의) 어긋남이 생긴다.
//
// 대조를 SQL 필터가 아니라 코드에서 하는 이유: PostgREST의 `.or(email.eq.X,phone.eq.X)`는
// 사용자 입력을 필터 문법 안에 그대로 이어 붙이므로, 쉼표·괄호가 섞인 입력이 필터 구조를
// 바꿀 수 있다. 사업코드로만 좁혀 온 뒤 나머지는 값 비교로 판정한다.

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

/** 명부에서 문이 열려 있다고 보는 상태. */
const OPEN_STATUSES = new Set(['INVITED', 'ACTIVE'])

/** 게스트가 진입할 수 없는 사업 상태(종료·취소). */
const DEAD_PROGRAM_STATUSES = new Set(['FINISHED', 'CANCELLED'])

export interface GuestInvitation {
  id: string
  invited_user_type: string
  company_id: string | null
  app_user_id: string | null
  name: string
  email: string | null
  phone: string | null
  otp_hash: string | null
  otp_expires_at: string | null
  otp_attempts: number
  participant_id: string | null
  invite_expires_at: string
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

/** 사업코드 표기 흔들림 흡수(공백·대소문자). programs.code는 6자리 영숫자다. */
export function normalizeCode(raw: unknown): string {
  return String(raw ?? '').trim().toUpperCase()
}

function sameName(a: string, b: string): boolean {
  return a.trim().replace(/\s+/g, '') === b.trim().replace(/\s+/g, '')
}

function sameEmail(a: string | null, b: string): boolean {
  if (!a) return false
  return a.trim().toLowerCase() === b.trim().toLowerCase()
}

function samePhone(a: string | null, b: string): boolean {
  if (!a) return false
  const digits = (s: string) => s.replace(/\D/g, '')
  const left = digits(a)
  return left.length > 0 && left === digits(b)
}

/**
 * 삼각 매핑 + 명부 개방 여부까지 통과한 초대를 찾는다. 하나라도 어긋나면 null이다.
 * 호출부는 null을 사유 구분 없이 중립 응답으로 처리해 계정 열거를 막는다.
 */
export async function findOpenInvitation(
  db: SupabaseClient,
  businessCode: string,
  name: string,
  contact: string,
): Promise<GuestMatch | null> {
  const code = normalizeCode(businessCode)
  const nm = String(name ?? '').trim()
  const ct = String(contact ?? '').trim()
  if (!code || !nm || !ct) return null

  const { data: rows } = await db
    .from('guest_invitations')
    .select(
      'id, invited_user_type, company_id, app_user_id, name, email, phone, ' +
        'otp_hash, otp_expires_at, otp_attempts, participant_id, invite_expires_at',
    )
    .eq('business_code', code)
    .gt('invite_expires_at', new Date().toISOString())
    .limit(100)

  const invitation = ((rows ?? []) as GuestInvitation[]).find(
    (r) => sameName(r.name, nm) && (sameEmail(r.email, ct) || samePhone(r.phone, ct)),
  )
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
