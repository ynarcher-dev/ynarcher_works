import type { BadgeTone } from '@ynarcher/ui'

/** AC 모듈 타입 정의(Program First 14모듈 중 모듈 보드 대상). */
export interface ModuleTypeDef {
  type: string
  label: string
  implemented: boolean
}

export const MODULE_TYPES: ModuleTypeDef[] = [
  { type: 'RECRUITMENT', label: '모집/신청서', implemented: true },
  { type: 'DOC_REVIEW', label: '서면평가', implemented: true },
  { type: 'ONSITE_EVAL', label: '대면평가', implemented: true },
  { type: 'ORIENTATION', label: 'OT/공통세션', implemented: true },
  { type: 'MENTORING', label: 'N:N 멘토링', implemented: true },
  { type: 'BUSINESS_MATCHING', label: '1:1 비즈니스 매칭', implemented: true },
  { type: 'DEMO_DAY', label: '데모데이', implemented: true },
  { type: 'OUTCOMES', label: '성과/KPI', implemented: true },
  { type: 'CUSTOM_ACTIVITY', label: '커스텀 활동', implemented: true },
]

export const PARTICIPATION_MODES = [
  'OPEN_APPLICATION',
  'REVIEWER_ASSIGNMENT',
  'ADMIN_ONLY',
  'STARTUP_FCFS',
  'AI_ALLOCATION',
  'MANUAL_ALLOCATION',
] as const

/**
 * 프로그램(프로젝트) 상태 수명주기(6단계):
 *   제안 → (성공) 준비 → 진행중 → 종료 / (중단) 취소 / (제안 실패) 미선정
 * DB program_status enum: PROPOSED/DRAFT/OPERATING/FINISHED/CANCELLED/NOT_SELECTED.
 * (등록/편집 폼에서 선택 가능한 값·순서는 PROGRAM_STATUS_OPTIONS 참조)
 */
export const PROGRAM_STATUS_OPTIONS = [
  'PROPOSED',
  'DRAFT',
  'OPERATING',
  'FINISHED',
  'CANCELLED',
  'NOT_SELECTED',
] as const

export const PROGRAM_STATUS_LABEL: Record<string, string> = {
  PROPOSED: '제안',
  DRAFT: '준비',
  OPERATING: '진행중',
  FINISHED: '종료',
  CANCELLED: '취소',
  NOT_SELECTED: '미선정',
  // 구 상태값(기존 데이터 표시용) — 신규 등록에서는 사용하지 않는다.
  RECRUITING: '모집',
  SCREENING: '심사',
  DEMO_DAY: '데모데이',
}

/** 프로그램 상태 배지 톤(상세 헤더·목록 공용). */
export const PROGRAM_STATUS_TONE: Record<string, BadgeTone> = {
  PROPOSED: 'info',
  DRAFT: 'neutral',
  OPERATING: 'success',
  FINISHED: 'neutral',
  CANCELLED: 'danger',
  NOT_SELECTED: 'warning',
  // 구 상태값
  RECRUITING: 'info',
  SCREENING: 'warning',
  DEMO_DAY: 'warning',
}

export const PARTICIPANT_ROLES = [
  'STARTUP',
  'EXPERT',
  'MENTOR',
  'JUDGE',
  'INVESTOR',
  'STAFF',
  'OBSERVER',
] as const
