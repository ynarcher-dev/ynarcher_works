import type { BadgeTone } from '@ynarcher/ui'

/**
 * 마이페이지 표시용 사업·참여 코드값의 한글 라벨.
 *
 * 상태 라벨·톤은 WORKS의 표시 규격(apps/works/src/features/program/config.ts)을 그대로
 * 옮긴 부분집합이다 — 게스트는 상태를 고르지 않으므로 수명주기 로직은 가져오지 않고,
 * 이미 붙은 값을 읽는 데 필요한 표만 든다. WORKS에서 라벨을 바꾸면 여기도 함께 맞출 것.
 */
export const PROGRAM_STATUS_LABEL: Record<string, string> = {
  PROPOSED: '시도',
  SELECTED: '선정',
  DRAFT: '준비',
  OPERATING: '진행중',
  FINISHED: '종료',
  CANCELLED: '취소',
  NOT_SELECTED: '미선정',
  RECRUITING: '모집',
  SCREENING: '심사',
  DEMO_DAY: '데모데이',
}

export const PROGRAM_STATUS_TONE: Record<string, BadgeTone> = {
  PROPOSED: 'warning',
  SELECTED: 'success',
  NOT_SELECTED: 'danger',
  DRAFT: 'neutral',
  OPERATING: 'info',
  FINISHED: 'success',
  CANCELLED: 'danger',
  RECRUITING: 'info',
  SCREENING: 'info',
  DEMO_DAY: 'info',
}

/** 명부 역할(program_participant_role) 라벨. */
export const PARTICIPANT_ROLE_LABEL: Record<string, string> = {
  STARTUP: '참여기업',
  EXPERT: '전문가',
  MENTOR: '멘토',
  JUDGE: '심사위원',
  INVESTOR: '투자자',
  STAFF: '운영진',
  OBSERVER: '참관',
}

export function participantRoleLabels(roles: readonly string[]): string {
  return roles.map((r) => PARTICIPANT_ROLE_LABEL[r] ?? r).join(' · ')
}
