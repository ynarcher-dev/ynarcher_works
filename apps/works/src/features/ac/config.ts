/** AC 모듈 타입 정의(Program First 14모듈 중 모듈 보드 대상). */
export interface ModuleTypeDef {
  type: string
  label: string
  implemented: boolean
}

export const MODULE_TYPES: ModuleTypeDef[] = [
  { type: 'RECRUITMENT', label: '모집/신청서', implemented: false },
  { type: 'DOC_REVIEW', label: '서면평가', implemented: false },
  { type: 'ONSITE_EVAL', label: '대면평가', implemented: false },
  { type: 'ORIENTATION', label: 'OT/공통세션', implemented: false },
  { type: 'MENTORING', label: 'N:N 멘토링', implemented: false },
  { type: 'BUSINESS_MATCHING', label: '1:1 비즈니스 매칭', implemented: false },
  { type: 'DEMO_DAY', label: '데모데이', implemented: false },
  { type: 'OUTCOMES', label: '성과/KPI', implemented: false },
  { type: 'CUSTOM_ACTIVITY', label: '커스텀 활동', implemented: false },
]

export const PARTICIPATION_MODES = [
  'OPEN_APPLICATION',
  'REVIEWER_ASSIGNMENT',
  'ADMIN_ONLY',
  'STARTUP_FCFS',
  'AI_ALLOCATION',
  'MANUAL_ALLOCATION',
] as const

export const PROGRAM_STATUS_LABEL: Record<string, string> = {
  DRAFT: '준비',
  RECRUITING: '모집',
  SCREENING: '심사',
  OPERATING: '운영',
  DEMO_DAY: '데모데이',
  FINISHED: '종료',
  CANCELLED: '취소',
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
