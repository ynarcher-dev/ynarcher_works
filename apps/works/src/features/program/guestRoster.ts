import { isGuestUserType } from '@/lib/userTypes'
import type { GuestAccountCandidate, ParticipantRow } from '@/features/program/participantHooks'
import type { MasterTable } from '@/features/program/participantPersona'

/**
 * GUEST 계정 명부의 **순수 규칙** — 누가 이 명부에 서는가, 두 기둥에 무엇이 서는가.
 *
 * 화면·훅과 갈라 둔 이유는 여기 있는 것이 전부 판정이기 때문이다. 판정이 컴포넌트 안에
 * 살면 시험하려고 화면을 띄워야 하고, 그러면 실제로 시험되는 것은 판정이 아니라 렌더링이다.
 *
 * **이 명부의 축은 계정이다**(2026-09-13 사용자 확정). 종전에는 자격(원장)이 축이라
 * `startups`·`networks` 탭이 서고 원장 없는 줄은 어느 탭에도 서지 못했다. 지금은 한 명부에
 * 전부 서고, 원장 연결은 **선택적 표시값**이다.
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

/** 명부·이관 창이 함께 쓰는 한 줄. 값은 전부 계정의 것이고 원장은 곁들이는 표시다. */
export interface GuestRosterRow {
  /** 표·선택·삭제가 쓰는 키. **명부 줄의 id**다 — 한 계정이 한 사업에 두 자격으로 설 수 있다. */
  participantId: string
  /** 이 줄로 문을 여는 계정. 아직 계정이 없는 옛 줄은 null이다. */
  userId: string | null
  accountName: string | null
  accountEmail: string | null
  accountPhone: string | null
  /**
   * 연결된 원장 하나 — **선택적 표시값**이다. 없으면 null이며, 그때 화면은 빈 칸을 세운다
   * (`임직원`이라 적지 않는다).
   */
  source: { masterTable: MasterTable; masterId: string; name: string } | null
}

/** 명부 조회 결과를 이 명부의 줄로 옮긴다. 임직원 줄은 여기서 빠진다. */
export function toGuestRosterRows(participants: readonly ParticipantRow[]): GuestRosterRow[] {
  return participants.filter(isGuestRosterRow).map((p) => ({
    participantId: p.id,
    userId: p.user_id,
    accountName: p.accountName,
    accountEmail: p.accountEmail,
    accountPhone: p.phone,
    source:
      p.master_table && p.master_id
        ? { masterTable: p.master_table, masterId: p.master_id, name: p.targetName }
        : null,
  }))
}

/** 왼쪽 기둥(아직 이 사업에 없는 계정)에 서는 한 줄. */
export type TransferLeftRow =
  | {
      kind: 'candidate'
      /** 목록 키. 계정 후보는 계정 id 하나로 유일하다. */
      key: string
      userId: string
      name: string
      /** 이름 아래가 아니라 검색에만 쓰이는 보조값(`PickLine`은 이름 한 줄만 세운다). */
      meta: string
      candidate: GuestAccountCandidate
    }
  | {
      /** 오른쪽에서 내린 줄 — 확정하면 명부에서 **빠진다**. 다시 올리면 없던 일이 된다. */
      kind: 'returning'
      key: string
      participantId: string
      userId: string | null
      name: string
      meta: string
    }

/** 오른쪽 기둥(이 사업의 GUEST 명부)에 서는 한 줄. */
export type TransferRightRow =
  | {
      /** 이번에 올린 계정 — 아직 아무 줄도 생기지 않았다. */
      kind: 'staged'
      key: string
      userId: string
      candidate: GuestAccountCandidate
    }
  | {
      /** 이미 명부에 있는 줄. 내리면 확정할 때 지워진다. */
      kind: 'member'
      key: string
      row: GuestRosterRow
    }

/** 후보 한 줄이 들고 있는 검색·표시용 보조값. 계정의 사실만 쓴다. */
export function candidateMeta(c: GuestAccountCandidate): string {
  return [c.email, c.phone].filter(Boolean).join(' · ')
}

/** 명부 한 줄이 들고 있는 보조값. 계정이 아직 없으면 그 사실을 적는다(지어내지 않는다). */
export function rosterMeta(row: GuestRosterRow): string {
  return [row.accountEmail, row.accountPhone].filter(Boolean).join(' · ') || '계정 정보 없음'
}

/**
 * 오른쪽 기둥을 세운다 — **이번에 올린 계정이 위**, 그 아래 기존 명부.
 *
 * 올린 줄이 위에 서는 이유는 그 줄만 방금 한 조작의 결과이기 때문이다. 기존 수십 건 아래로
 * 밀리면 무엇을 올렸는지 확인하러 스크롤해야 한다.
 */
export function buildRightRows(
  staged: readonly GuestAccountCandidate[],
  roster: readonly GuestRosterRow[],
  removed: readonly string[],
): TransferRightRow[] {
  const fresh: TransferRightRow[] = staged.map((c) => ({
    kind: 'staged',
    key: `staged:${c.userId}`,
    userId: c.userId,
    candidate: c,
  }))
  const kept: TransferRightRow[] = roster
    .filter((r) => !removed.includes(r.participantId))
    .map((r) => ({ kind: 'member', key: `member:${r.participantId}`, row: r }))
  return [...fresh, ...kept]
}

/**
 * 왼쪽 기둥을 세운다 — **내린 줄이 맨 위**, 그 아래 이번 페이지의 계정 후보.
 *
 * 내린 줄이 위에 서는 이유도 같다: 방금 한 조작의 결과는 눈에 보이는 자리에 있어야 되돌릴
 * 수 있다.
 *
 * **후보에서 빠지는 계정은 셋이다.** 이미 이 명부에 서 있는 계정, 이번에 올린 계정, 그리고
 * 방금 내린 줄과 같은 계정. 마지막이 요점이다 — 내린 계정이 후보로 다시 서면 같은 계정이
 * 한 기둥에 두 줄로 서고, 담당자가 아래쪽(후보) 줄을 올리면 위의 '뺌'은 그대로 남아 **같은
 * 계정을 빼면서 동시에 담는** 확정이 만들어진다.
 *
 * 후보는 서버가 이미 검색어로 걸러 보냈으므로 여기서 다시 걸지 않는다. 내린 줄만 건다 —
 * 걸지 않으면 검색으로 좁힌 목록에 검색어와 무관한 줄 하나가 남는다.
 */
export function buildLeftRows(
  candidates: readonly GuestAccountCandidate[],
  roster: readonly GuestRosterRow[],
  staged: readonly GuestAccountCandidate[],
  removed: readonly string[],
  search: string,
): TransferLeftRow[] {
  const term = search.trim().toLowerCase()
  const back: TransferLeftRow[] = roster
    .filter((r) => removed.includes(r.participantId))
    .map((r) => ({
      kind: 'returning' as const,
      key: `member:${r.participantId}`,
      participantId: r.participantId,
      userId: r.userId,
      name: r.accountName || r.source?.name || '(이름 없음)',
      meta: rosterMeta(r),
    }))
    .filter((r) => !term || `${r.name} ${r.meta}`.toLowerCase().includes(term))

  const taken = new Set<string>()
  for (const r of roster) {
    // 내린 줄의 계정은 '이미 있음'으로 치지 않는다 — 위의 되돌림 줄이 그 계정을 이미 세운다.
    if (r.userId && !removed.includes(r.participantId)) taken.add(r.userId)
  }
  for (const r of back) if (r.userId) taken.add(r.userId)
  for (const s of staged) taken.add(s.userId)

  const fresh: TransferLeftRow[] = candidates
    .filter((c) => !taken.has(c.userId))
    .map((c) => ({
      kind: 'candidate' as const,
      key: `candidate:${c.userId}`,
      userId: c.userId,
      name: c.name,
      meta: candidateMeta(c),
      candidate: c,
    }))

  return [...back, ...fresh]
}

/**
 * 계정을 대기 목록에 올린다 — **같은 계정은 한 번만 선다.**
 *
 * 멱등이어야 하는 이유는 같은 계정에 이르는 길이 둘이기 때문이다: 후보 목록에서 고르는 길과,
 * 검색·페이지를 바꿔 같은 계정을 다시 만나 고르는 길. 두 번 실리면 확정할 때 같은 계정 id가
 * 두 번 나가고, 서버가 그것을 중복으로 볼지 무시할지에 화면의 건수가 매달린다.
 */
export function stageAccount(
  staged: readonly GuestAccountCandidate[],
  candidate: GuestAccountCandidate,
): GuestAccountCandidate[] {
  if (staged.some((c) => c.userId === candidate.userId)) return [...staged]
  return [...staged, candidate]
}

/** 대기 목록에서 계정을 뺀다(내리기·확정 완료가 함께 쓴다). */
export function dropStaged(
  staged: readonly GuestAccountCandidate[],
  userIds: readonly string[],
): GuestAccountCandidate[] {
  return staged.filter((c) => !userIds.includes(c.userId))
}
