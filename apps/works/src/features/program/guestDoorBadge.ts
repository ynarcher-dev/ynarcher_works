import type { BadgeTone } from '@ynarcher/ui'
import type { ParticipantLoginStatus } from '@/features/program/participantHooks'

/**
 * 게스트가 진입할 수 없는 상태. 이때 열린 문은 화면에서 '닫힘'으로 읽힌다.
 *
 * 사업(종료·취소)과 조합(해산)의 값을 **한 목록에 담아도 섞이지 않는다** — 두 enum이
 * 값을 하나도 공유하지 않으므로, 어느 원장의 행인지 몰라도 판정이 갈리지 않는다.
 * 조합의 청산 중(LIQUIDATING)은 여기 들지 않는다: 그 구간에도 회수·정산 안내가 오간다.
 *
 * 값이 겹치는 원장이 들어오는 날에는 이 목록을 원장별로 갈라야 한다. 서버는 이미 그렇게
 * 되어 있다(app.guest_program_ids가 원장마다 조건을 따로 적는다).
 */
const DEAD_STATUSES = ['FINISHED', 'CANCELLED', 'CLOSED']

export interface DoorBadge {
  label: string
  tone: BadgeTone
}

export interface GuestDoorInput {
  loginStatus: ParticipantLoginStatus
  /** 원장 대상이 붙어 있는가. 내부 임직원 참가자는 원장이 없어 로그인이라는 개념이 없다. */
  hasTarget: boolean
  /** 그 사업·조합의 진행 상태. 모르면 null이며 그때는 종료 판정만 빠진다. */
  programStatus: string | null
  /** 그 사업 게스트의 접근 종료. 기간은 줄이 아니라 사업이 갖는다(3_9_1 §8). */
  accessEndsAt: string | null
}

/**
 * "이 사람이 이 사업에 지금 들어올 수 있는가"의 **결론 한 칸**.
 *
 * 실제 게이트는 사업 상태·개방 상태·기간의 AND이므로, 재료를 늘어놓고 담당자가 머리로 조합하게
 * 두지 않는다. 값이 겹칠 때의 순서가 곧 할 일의 순서다 — 사업이 끝난 것 → 담당자가 막은 것 →
 * 기간이 지난 것 → 아직 열지 않은 것. 위의 사실이 아래를 덮으므로 차단된 줄에 '기간 만료'가
 * 뜨거나 끝난 사업이 '이용 중'으로 보이는 일이 없다.
 *
 * **판정이 사는 자리는 여기 하나다.** 참가자 명부(사업 상세)와 GUEST계정 발급(계정 목록)이
 * 같은 사실을 서로 다른 화면에서 답하는데, 각자 조합하면 어긋난 날 어느 쪽이 사실인지 판정할
 * 근거가 없다 — 명부는 '이용 중'인데 계정 목록은 '기간 만료'인 화면이 그렇다.
 *
 * **차단과 기간은 직교한 축**이라, 만료된 줄을 차단했다 해제해도 다시 '기간 만료'로 돌아온다
 * (여는 방법은 해제가 아니라 기간 연장이다).
 */
export function guestDoorBadge({
  loginStatus,
  hasTarget,
  programStatus,
  accessEndsAt,
}: GuestDoorInput): DoorBadge {
  if (loginStatus === 'NOT_APPLICABLE' || !hasTarget) {
    return { label: '해당 없음', tone: 'neutral' }
  }
  const opened = loginStatus === 'INVITED' || loginStatus === 'ACTIVE'
  if (programStatus && DEAD_STATUSES.includes(programStatus) && opened) {
    return { label: '종료', tone: 'neutral' }
  }
  if (loginStatus === 'BLOCKED') return { label: '차단', tone: 'danger' }
  if (opened && accessEndsAt && new Date(accessEndsAt).getTime() <= Date.now()) {
    return { label: '기간 만료', tone: 'warning' }
  }
  switch (loginStatus) {
    case 'INVITED':
      return { label: '초대', tone: 'warning' }
    case 'ACTIVE':
      return { label: '이용 중', tone: 'success' }
    default:
      return { label: '미발급', tone: 'neutral' }
  }
}

/** 문이 실제로 열려 있는가(계정 목록의 `열림 n/m` 집계 축). 판정은 위 한 벌을 그대로 쓴다. */
export function isDoorOpen(input: GuestDoorInput): boolean {
  const label = guestDoorBadge(input).label
  return label === '초대' || label === '이용 중'
}
