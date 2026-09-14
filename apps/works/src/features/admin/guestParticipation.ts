import type { GuestEntityKey } from '@/features/guest/host'
import type { GuestDoorInput } from '@/features/program/guestDoorBadge'
import { isDoorOpen } from '@/features/program/guestDoorBadge'

/**
 * GUEST 계정 목록·상세가 참여 줄을 세는 규칙.
 *
 * 계정과 참여 사업은 별도 축이다. 계정이 어느 원장에서 왔는지는 묻지 않고, 실제 참여만 센다.
 *
 * 근거: docs/docs_planning/3_9_1_guest_unified_account.md §3·§4
 */

/** 문 판정에 필요한 참여 줄 한 개의 최소 모양. */
export interface GuestParticipationRow {
  login_status: GuestDoorInput['loginStatus']
  entity_key: GuestEntityKey
  program_status: string | null
  access_ends_at: string | null
}

/**
 * 그 참여 줄의 문 상태를 판정할 재료. 판정 자체는 명부와 같은 한 벌(`guestDoorBadge`)이 쓴다.
 *
 * **`hasTarget`은 항상 참이다.** 이 목록에 실려 오는 줄은 모두 게스트 계정의 실제 참여이고,
 * `hasTarget: false`가 가리키는 것은 "로그인이라는 개념이 없는 참가자"(원장 대상이 없는 내부
 * 임직원 참가자)다 — 그런 줄은 계정 목록에 아예 오지 않는다.
 *
 * 종전에는 원장 연결 여부를 넘겼다. 참여에 원장 행이 반드시 붙던 동안은 값이 같았지만,
 * 원장 없는 참여(계정만 걸린 줄)가 실제로 생기면서 **열려 있는 문이 '해당 없음'으로 읽혔다** —
 * 원장 행이 없다는 사실과 들어올 수 없다는 사실은 다른 축이다. 들어올 수 없다는 판정은 여전히
 * `NOT_APPLICABLE`이 소유하고(서버가 그 값을 준다), 계정 정지는 아래 집계가 따로 본다.
 */
export function guestDoorInput(row: GuestParticipationRow): GuestDoorInput {
  return {
    loginStatus: row.login_status,
    hasTarget: true,
    programStatus: row.program_status,
    accessEndsAt: row.access_ends_at,
  }
}

/**
 * 지금 실제로 들어올 수 있는 사업 수(목록 `로그인 가능`의 분자).
 *
 * **정지된 계정은 0이다** — 계정 축이 사업 축보다 먼저 걸리므로 사업별 문이 열려 있어도
 * 어디에도 들어오지 못한다. 분모(걸려 있는 사업 수)는 정지로 달라지지 않으며, 해제하면
 * 원래 열려 있던 사업이 그대로 돌아온다.
 */
export function guestOpenProgramCount(account: {
  is_active: boolean
  programs: readonly GuestParticipationRow[]
}): number {
  if (!account.is_active) return 0
  return account.programs.filter((row) => isDoorOpen(guestDoorInput(row))).length
}

/** 상세 표가 무엇을 세우고 머리글에 무엇을 적는가. */
export interface GuestDetailScope<P> {
  programs: P[]
  heading: string
  /** 이 표가 무엇인지 덧붙일 한 문장. 덧붙일 것이 없으면 null. */
  note: string | null
  /** 세우지 못한 줄 수(볼 권한이 없거나 원장에서 삭제된 것). 셀 수 없으면 0. */
  hidden: number
}

/** 상세 표는 원장 분류 없이 이 계정의 보이는 참여 사업을 전부 세운다. */
export function guestDetailScope<P extends { entity_key: GuestEntityKey }>(
  account: { programs: readonly P[]; program_count: number } | null,
): GuestDetailScope<P> {
  if (!account) return { programs: [], heading: '참여 프로젝트/FUND', note: null, hidden: 0 }

  return {
    programs: [...account.programs],
    heading: '참여 프로젝트/FUND',
    note: null,
    hidden: Math.max(0, account.program_count - account.programs.length),
  }
}
