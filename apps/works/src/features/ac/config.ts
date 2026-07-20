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

/**
 * 모듈 공유 범위(participation과 별개 축). GUEST/공개 노출 여부를 정한다.
 * DB module_visibility enum: INTERNAL_ONLY/GUEST_ONLY/PUBLIC. 기본값은 최소 공개(비공개).
 */
export const MODULE_VISIBILITY_OPTIONS = [
  { value: 'PUBLIC', label: '전체공개', hint: '공개 URL로 누구나 열람(모집형)' },
  { value: 'GUEST_ONLY', label: '일부공개', hint: 'GUEST 포털의 참여 기업/전문가만' },
  { value: 'INTERNAL_ONLY', label: '비공개', hint: 'WORKS 내부 운영자만' },
] as const

export const MODULE_VISIBILITY_LABEL: Record<string, string> = {
  PUBLIC: '전체공개',
  GUEST_ONLY: '일부공개',
  INTERNAL_ONLY: '비공개',
}

export const MODULE_VISIBILITY_TONE: Record<string, BadgeTone> = {
  PUBLIC: 'success',
  GUEST_ONLY: 'info',
  INTERNAL_ONLY: 'neutral',
}

/** 배정 방식(participation_mode) enum 전체. 표시 라벨은 아래 맵을 사용한다. */
export const PARTICIPATION_MODES = [
  'OPEN_APPLICATION',
  'REVIEWER_ASSIGNMENT',
  'ADMIN_ONLY',
  'STARTUP_FCFS',
  'AI_ALLOCATION',
  'MANUAL_ALLOCATION',
] as const

export const PARTICIPATION_MODE_LABEL: Record<string, string> = {
  OPEN_APPLICATION: '공개 지원 접수',
  REVIEWER_ASSIGNMENT: '심사위원 배정',
  ADMIN_ONLY: '운영자 전담',
  STARTUP_FCFS: '선착순 예약',
  AI_ALLOCATION: 'AI 자동 배정',
  MANUAL_ALLOCATION: '수동 배정',
}

/**
 * 모듈 타입별 배정 방식 정책. `default`는 강제 기본값이며, `options`가 있는 모듈만
 * 운영자가 그 범위 안에서 선택할 수 있다(현재 비즈니스 매칭만 선택형). 나머지는 고정.
 * 근거: docs/docs_planning/3_4_2_ac_program_overview.md §6.3
 */
export const MODULE_PARTICIPATION: Record<string, { default: string; options?: string[] }> = {
  RECRUITMENT: { default: 'OPEN_APPLICATION' },
  DOC_REVIEW: { default: 'REVIEWER_ASSIGNMENT' },
  ONSITE_EVAL: { default: 'REVIEWER_ASSIGNMENT' },
  ORIENTATION: { default: 'ADMIN_ONLY' },
  MENTORING: { default: 'MANUAL_ALLOCATION' },
  BUSINESS_MATCHING: {
    default: 'STARTUP_FCFS',
    options: ['STARTUP_FCFS', 'AI_ALLOCATION', 'MANUAL_ALLOCATION'],
  },
  DEMO_DAY: { default: 'REVIEWER_ASSIGNMENT' },
  OUTCOMES: { default: 'ADMIN_ONLY' },
  CUSTOM_ACTIVITY: { default: 'ADMIN_ONLY' },
}

/** 모듈 타입의 강제 배정 방식 기본값(미정의 타입은 null). */
export function defaultParticipationMode(moduleType: string): string | null {
  return MODULE_PARTICIPATION[moduleType]?.default ?? null
}

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

/**
 * 상태의 단계 이원화: 제안 단계(제안서 작성~발표, proposal_start/end_date)와
 * 운영 단계(실제 행사 관리, start/end_date)로 나뉜다. 폼·표시가 공유하는 그룹 정의.
 */
export const PROGRAM_PROPOSAL_STATUSES = ['PROPOSED', 'NOT_SELECTED'] as const
export const PROGRAM_OPERATION_STATUSES = ['DRAFT', 'OPERATING', 'FINISHED', 'CANCELLED'] as const

export type ProgramStage = 'PROPOSAL' | 'OPERATION'

/** 상태값이 속한 단계. 구 상태값(RECRUITING 등)은 운영 단계로 간주한다. */
export function programStage(status: string): ProgramStage {
  return (PROGRAM_PROPOSAL_STATUSES as readonly string[]).includes(status)
    ? 'PROPOSAL'
    : 'OPERATION'
}

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

/**
 * 사업구분(category): 공공/민간/매출 3분류. DB programs.category(text, null=미지정).
 * 등록/편집 폼 선택값·상세/목록 배지 표시에 공용으로 쓰인다.
 */
export const PROGRAM_CATEGORY_OPTIONS = ['PUBLIC', 'PRIVATE', 'REVENUE'] as const

export const PROGRAM_CATEGORY_LABEL: Record<string, string> = {
  PUBLIC: '공공',
  PRIVATE: '민간',
  REVENUE: '매출',
}

export const PROGRAM_CATEGORY_TONE: Record<string, BadgeTone> = {
  PUBLIC: 'info',
  PRIVATE: 'neutral',
  REVENUE: 'success',
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
