import type { GuestEntityKey } from '@/features/guest/host'
import type { GuestDoorInput } from '@/features/program/guestDoorBadge'
import { isDoorOpen } from '@/features/program/guestDoorBadge'
import type { MasterTable } from '@/features/program/participantPersona'

/**
 * GUEST 계정 목록·상세가 참여 줄을 세는 규칙.
 *
 * 화면에서 떼어 둔 이유는 **인격과 참여가 다른 축**이기 때문이다. 목록의 Y는 계정이 가진
 * 인격이 답하고, 상세의 표는 그 계정이 걸린 사업이 답한다. 둘을 같은 칸에서 조합하면
 * "Y인데 표가 비어 있다"가 생기고, 화면은 그것이 권한 문제인지 인격 문제인지 답하지 못한다.
 *
 * 근거: docs/docs_planning/3_9_1_guest_unified_account.md §3·§4
 */

/**
 * 목록에 고정으로 서는 다섯 칸의 키.
 *
 * 넷은 **인격**(어느 원장의 누구로 참여하는가)이고 `fund` 하나는 **참여**다 — FUND는 원장
 * 인격이 아니라 조합 참여 사실이며(`MasterTable`에 값을 더하지 않는다), 스타트업 인격으로
 * 조합에 든 사람도 같은 칸에 선다.
 */
export type GuestListFacetKey = MasterTable | 'fund'

/** 문 판정에 필요한 참여 줄 한 개의 최소 모양. */
export interface GuestParticipationRow {
  login_status: GuestDoorInput['loginStatus']
  entity_key: GuestEntityKey
  /** 이 줄이 어느 원장 인격으로 걸렸는가. **없을 수 있다**(아래 `guestDoorInput` 주석). */
  master_table: MasterTable | null
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
 * 종전에는 `Boolean(master_table)`을 넘겼다. 참여에 인격이 반드시 붙던 동안은 값이 같았지만,
 * 인격 없는 참여(계정만 걸린 줄)가 실제로 생기면서 **열려 있는 문이 '해당 없음'으로 읽혔다** —
 * 인격이 없다는 사실과 들어올 수 없다는 사실은 다른 축이다. 들어올 수 없다는 판정은 여전히
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

/**
 * 그 칸에 Y가 서는가.
 *
 * 인격 넷은 계정이 가진 인격이 답하고, FUND는 **보이는 참여 줄**이 답한다 — 조합 참여는
 * 인격이 아니라 사업 연결이므로 볼 권한이 없는 조합은 서버가 애초에 내려주지 않고, 그때는
 * 이 칸도 서지 않는다(화면에서 가리는 것이 아니라 없는 것이다).
 */
export function hasGuestListFacet(
  account: {
    identities: readonly { master_table: MasterTable }[]
    programs: readonly { entity_key: GuestEntityKey }[]
  },
  key: GuestListFacetKey,
): boolean {
  if (key === 'fund') return account.programs.some((program) => program.entity_key === 'fund')
  return account.identities.some((identity) => identity.master_table === key)
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

/**
 * 상세 표의 범위.
 *
 * **인격 칸(넷)은 걸러내지 않는다.** Y는 계정이 그 원장 인격을 가졌다는 사실이고, 참여 줄의
 * 자격은 줄마다 따로 있다 — 인격으로 줄을 걸러내면 인격 없는 참여(계정만 걸린 줄)와 다른
 * 인격으로 걸린 참여가 표에서 사라져, Y를 눌렀는데 빈 표가 뜬다. 그래서 인격 칸을 누르면
 * 이 계정이 걸린 사업 **전부**를 세우고 머리글로 그렇다고 밝힌다(`계정 참여 사업`).
 *
 * **FUND 칸만 걸러낸다.** 그쪽 Y는 인격이 아니라 조합 참여 사실 자체이므로, 그 사실을
 * 세운 줄과 표가 정확히 같다.
 *
 * `hidden`은 전부를 세울 때만 낸다 — 걸러낸 표에서 "보이지 않는 몇 건"을 적으면 화면이
 * 세지 않은 수를 짐작해 말하는 것이 된다(서버는 볼 수 없는 줄을 내려주지 않는다).
 */
export function guestDetailScope<P extends { entity_key: GuestEntityKey }>(
  account: { programs: readonly P[]; program_count: number } | null,
  facet: GuestListFacetKey | null,
  /** 누른 칸의 라벨. 인격 칸의 설명 한 문장에만 쓴다. */
  facetLabel?: string,
): GuestDetailScope<P> {
  if (!account) return { programs: [], heading: '참여 프로젝트/FUND', note: null, hidden: 0 }

  if (facet === 'fund') {
    return {
      programs: account.programs.filter((program) => program.entity_key === 'fund'),
      heading: '참여 FUND',
      note: null,
      hidden: 0,
    }
  }

  return {
    programs: [...account.programs],
    heading: facet ? '계정 참여 프로젝트/FUND' : '참여 프로젝트/FUND',
    note: facet
      ? `‘${facetLabel ?? '인격'}’ 칸의 Y는 이 계정이 그 원장 인격을 가졌다는 사실이며, 아래 항목마다 그 자격으로 참여한다는 뜻은 아닙니다. 항목별 자격은 각 줄의 자격 칸이 답하므로, 이 표는 걸러내지 않고 이 계정이 연결된 프로젝트/FUND를 전부 세웁니다.`
      : null,
    hidden: Math.max(0, account.program_count - account.programs.length),
  }
}
