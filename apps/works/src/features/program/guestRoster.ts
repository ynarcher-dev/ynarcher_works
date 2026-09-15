import { isGuestUserType } from '@/lib/userTypes'
import type { GuestAccountCandidate, ParticipantRow } from '@/features/program/participantHooks'

/**
 * GUEST 계정 명부의 **순수 규칙** — 누가 이 명부에 서는가, 두 기둥에 무엇이 서는가.
 *
 * 화면·훅과 갈라 둔 이유는 여기 있는 것이 전부 판정이기 때문이다. 판정이 컴포넌트 안에
 * 살면 시험하려고 화면을 띄워야 하고, 그러면 실제로 시험되는 것은 판정이 아니라 렌더링이다.
 *
 * **이 명부의 축은 계정이다**(2026-09-13 사용자 확정). 종전에는 자격(원장)이 축이라
 * `startups`·`networks` 탭이 서고 원장 없는 줄은 어느 탭에도 서지 못했다. 지금은 한 명부에
 * 전부 서고, **원장 식별 관계(`master_table`·`master_id`)는 아예 들지 않는다**
 * (2026-09-14 독립 계정 정책, 3_9_3).
 */

/**
 * 이 줄이 GUEST 명부에 서는가 — **거르는 것은 실제 내부 임직원뿐이다.**
 *
 * 세 갈래를 가른다.
 *  · 계정이 없는 줄(`user_id`가 null) — 선다. 원장 대상은 정해졌고 계정만 아직 없는 상태이며,
 *    임직원일 수 없다(임직원은 계정이 먼저 있고 그 계정으로 담긴다).
 *  · 게스트 계정이 달린 줄 — 선다. 원장 연결 여부는 묻지 않는다.
 *  · 내부 임직원 계정이 달린 줄 — 서지 않는다. 이 명부는 *밖에서 들어오는 사람*의 축이고,
 *    임직원은 WORKS로 들어오므로 여기서 문을 여닫을 일이 없다.
 *
 * 종전 판정은 `master_table === null`이었다. 그것이 임직원과 **원장 없는 게스트**를 같은
 * 것으로 묶었고, 화면은 원장 없는 게스트를 `임직원`이라 불렀다 — 없는 사실을 단언한 자리다.
 */
export function isGuestRosterRow(row: ParticipantRow): boolean {
  if (!row.user_id) return true
  return isGuestUserType(row.userType)
}

/**
 * 명부·이관 창이 함께 쓰는 한 줄. **원장 식별 관계는 들지 않는다.**
 *
 * 종전에는 연결된 원장 하나(`source` — 자격·원장 id·원장 이름)를 곁들여 들었다. 걷은 이유는
 * GUEST 계정이 원장 ID를 들지 않기 때문이다(2026-09-14 독립 계정 정책, 3_9_3) — 계정을
 * 사업에 잇는 창구가 `master_table`·`master_id`를 비운 채 줄을 만들고, 옛 줄의 값은
 * 마이그레이션이 지웠다.
 *
 * 걷은 것은 **식별 관계뿐이다.** 표에 서는 값의 출처는 그대로이며, 어느 값이 어디서 오는지는
 * 아래 각 칸이 답한다.
 */
export interface GuestRosterRow {
  /** 표·선택·삭제가 쓰는 키. **명부 줄의 id**다 — 한 계정이 한 사업에 여러 줄로 설 수 있다. */
  participantId: string
  /** 이 줄로 문을 여는 계정. 아직 계정이 없는 옛 줄은 null이다. */
  userId: string | null
  accountName: string | null
  accountEmail: string | null
  /**
   * 이 줄의 연락처. **계정 프로필이 아니라 사업 원장의 현재 값**이다
   * (`ParticipantRow.phone`) — 원장 식별 관계를 걷은 뒤에도 이 출처는 그대로다.
   */
  accountPhone: string | null
}

/** 명부 조회 결과를 이 명부의 줄로 옮긴다. 임직원 줄은 여기서 빠진다. */
export function toGuestRosterRows(participants: readonly ParticipantRow[]): GuestRosterRow[] {
  return participants.filter(isGuestRosterRow).map((p) => ({
    participantId: p.id,
    userId: p.user_id,
    accountName: p.accountName,
    accountEmail: p.accountEmail,
    accountPhone: p.phone,
  }))
}

/** 계정 고르기 표에 서는 한 줄 — 후보 계정에 이 사업에서의 사실 하나를 얹은 것. */
export interface GuestAccountPickRow extends GuestAccountCandidate {
  /**
   * 이 계정이 **이미 이 사업의 명부에 있는가**. 있으면 목록에서 지우지 않고 그 사실을 적은 채
   * 세우며, 고를 수만 없게 한다.
   *
   * 숨기지 않는 이유는 숨김이 담당자에게 "없다"로 읽히기 때문이다. 이미 담긴 계정이 목록에서
   * 사라지면 담당자는 그 사람이 아직 안 들어와 있다고 보고 계정을 **하나 더 만들러 간다** —
   * 같은 사람의 계정이 두 벌 생기는 길이 거기서 열린다.
   */
  alreadyAdded: boolean
}

/**
 * 이 명부가 이미 들고 있는 **계정 id**의 집합.
 *
 * 판정 키가 계정 id인 것이 요점이다. 원장 id로 보면 원장에 붙지 않은 계정을 판정할 수 없고
 * (그 계정에는 원장 id가 없다), 그때 이미 담긴 계정이 후보에 다시 서서 두 번 담긴다.
 * 계정이 아직 없는 옛 명부 줄(`userId`가 null)은 어느 계정과도 겹치지 않으므로 빠진다.
 */
export function rosterAccountIds(roster: readonly GuestRosterRow[]): Set<string> {
  return new Set(roster.map((r) => r.userId).filter((id): id is string => Boolean(id)))
}

/**
 * 후보 계정에 '이미 담김'을 표시해 표의 줄로 옮긴다 — **거르지 않고 표시만 한다.**
 *
 * 서버가 검색·탭·페이지로 이미 걸러 보낸 목록이므로 여기서 다시 걸지 않는다. 여기서 한 번 더
 * 걸면 서버가 답한 전체 건수와 화면의 줄 수가 어긋나 페이저가 빈 페이지를 만든다.
 */
export function markAlreadyAdded(
  candidates: readonly GuestAccountCandidate[],
  roster: readonly GuestRosterRow[],
): GuestAccountPickRow[] {
  const taken = rosterAccountIds(roster)
  return candidates.map((c) => ({ ...c, alreadyAdded: taken.has(c.userId) }))
}
