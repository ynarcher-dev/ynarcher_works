import type { BadgeTone } from '@ynarcher/ui'
import {
  Ban,
  CircleCheck,
  CircleHelp,
  CirclePlay,
  CircleX,
  ClipboardList,
  Flag,
  Send,
  type LucideIcon,
} from 'lucide-react'

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
 * 프로그램(프로젝트) 상태 수명주기:
 *   [제안 단계] 시도 → 선정 ┈▶ [운영 단계] 준비 → 진행중 → 종료 / (중단) 취소
 *              ↘ (미선정) 미선정 … 프로젝트 종료(terminal)
 * '선정'은 운영 단계를 열어 줄 뿐 자동으로 넘어가지 않는다(┈▶ = 사용자가 직접 전환).
 * 선정(제안이 통과함)과 준비(운영 채비를 함)는 서로 다른 사실이고, 자동 전환하면 선정만 되고
 * 아직 착수하지 않은 사업이 원장에 남지 않아 목록·집계에서 가려낼 수 없다.
 * DB program_status enum: PROPOSED/SELECTED/NOT_SELECTED/DRAFT/OPERATING/FINISHED/CANCELLED.
 *
 * 제안 단계를 운용하는지는 워크스페이스가 정한다(ProgramWorkspaceConfig.hasProposalStage).
 * AC는 제안으로 수주해 운영까지 가지만, M&A·PROJECT는 착수가 곧 시작이라 운영 4단계만 쓴다 —
 * 쓰지 않는 단계를 남겨 두면 목록·집계에 영원히 0건인 칸이 서고, 제안으로 잘못 등록된 건이
 * 어느 단계에도 속하지 않은 채 원장에 남는다. 선택 가능한 값은 programStatusOptions() 참조.
 */
export const PROGRAM_PROPOSAL_STATUSES = ['PROPOSED', 'SELECTED', 'NOT_SELECTED'] as const
export const PROGRAM_OPERATION_STATUSES = ['DRAFT', 'OPERATING', 'FINISHED', 'CANCELLED'] as const

export type ProgramStage = 'PROPOSAL' | 'OPERATION'

/** 상태값이 속한 단계. 구 상태값(RECRUITING 등)은 운영 단계로 간주한다. */
export function programStage(status: string): ProgramStage {
  return (PROGRAM_PROPOSAL_STATUSES as readonly string[]).includes(status)
    ? 'PROPOSAL'
    : 'OPERATION'
}

/**
 * 워크스페이스가 운용하는 상태 전체(폼 셀렉트·목록 필터·상태별 집계가 공유하는 단일 원천).
 * 제안 단계를 쓰지 않는 워크스페이스에서는 운영 4종만 돌려준다.
 */
export function programStatusOptions(hasProposalStage: boolean): readonly string[] {
  return hasProposalStage
    ? [...PROGRAM_PROPOSAL_STATUSES, ...PROGRAM_OPERATION_STATUSES]
    : PROGRAM_OPERATION_STATUSES
}

/** 신규 등록의 기본 상태 — 수명주기의 첫 칸(제안을 쓰면 '시도', 아니면 '준비'). */
export function defaultProgramStatus(hasProposalStage: boolean): string {
  return hasProposalStage ? 'PROPOSED' : 'DRAFT'
}

/**
 * 진행 현황(프로세스 뷰)의 흐름 정의 — 수명주기를 왼쪽에서 오른쪽으로 편 것.
 * 묶음은 위 `PROGRAM_*_STATUSES`와 같은 이원화(제안/운영)를 따른다.
 *
 * 이탈(`exits`)은 그 단계에서 빠져나가는 종착 상태이므로 다른 묶음으로 몰지 않고 자기 단계
 * 끝에 함께 둔다 — 미선정은 제안 단계의 결말이고 취소는 운영 단계의 결말이라, 한데 모으면
 * 어느 단계에서 빠졌는지가 사라진다. 다만 `statuses`와 화살표로 잇지는 않는다
 * ("선정 → 미선정"으로 읽히면 흐름이 거짓말을 한다) — 점선으로 갈라 병렬로 놓는다.
 */
const PROGRAM_FLOW_GROUPS = [
  {
    stage: 'PROPOSAL',
    label: '제안 단계',
    statuses: ['PROPOSED', 'SELECTED'],
    exits: ['NOT_SELECTED'],
  },
  {
    stage: 'OPERATION',
    label: '운영 단계',
    statuses: ['DRAFT', 'OPERATING', 'FINISHED'],
    exits: ['CANCELLED'],
  },
] as const

/** 워크스페이스가 실제로 밟는 흐름 묶음만. 운영만 쓰는 곳에는 제안 줄을 그리지 않는다. */
export function programFlowGroups(hasProposalStage: boolean) {
  return hasProposalStage
    ? PROGRAM_FLOW_GROUPS
    : PROGRAM_FLOW_GROUPS.filter((g) => g.stage === 'OPERATION')
}

export const PROGRAM_STATUS_LABEL: Record<string, string> = {
  PROPOSED: '시도',
  SELECTED: '선정',
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

/**
 * 상태별 아이콘(진행 현황 프로세스 뷰 전용).
 *
 * 라벨·톤과 나란히 두는 이유는 셋이 한 상태의 표시 규격이기 때문이다 — 흩어 두면 상태를
 * 하나 늘릴 때 어디를 더 고쳐야 하는지가 이름으로 드러나지 않는다.
 * 구 상태값(RECRUITING 등)은 넣지 않는다. 프로세스 뷰가 그것들을 '수명주기 밖' 한 칸으로
 * 합치므로 개별 아이콘이 그려질 자리가 없고, 없는 값을 채워 두면 쓰이지 않는 규격이 남는다.
 *
 * 고른 기준은 '그 단계에서 무엇을 하는가'다 — 제안서를 낸다(Send) / 통과했다(CircleCheck) /
 * 떨어졌다(CircleX) / 채비한다(ClipboardList) / 돌아간다(CirclePlay) / 결승선(Flag) /
 * 멈췄다(Ban). 상태끼리 형태가 겹치지 않아야 색 없이도 구분된다.
 */
export const PROGRAM_STATUS_ICON: Record<string, LucideIcon> = {
  PROPOSED: Send,
  SELECTED: CircleCheck,
  NOT_SELECTED: CircleX,
  DRAFT: ClipboardList,
  OPERATING: CirclePlay,
  FINISHED: Flag,
  CANCELLED: Ban,
}

/** 수명주기 어디에도 속하지 않는 잔여 건(구 상태값)을 가리키는 아이콘. */
export const PROGRAM_UNKNOWN_STATUS_ICON: LucideIcon = CircleHelp

/** 프로그램 상태 배지 톤(상세 헤더·목록 공용). */
export const PROGRAM_STATUS_TONE: Record<string, BadgeTone> = {
  PROPOSED: 'info',
  SELECTED: 'success',
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
 * 사업구분(category)은 워크스페이스마다 값이 다르므로 각 워크스페이스 config가 단일 원천이다.
 * AC는 features/ac/AcWorkspace.tsx, M&A는 features/mna/MnaWorkspace.tsx,
 * PROJECT는 features/project/ProjectWorkspace.tsx의 `categories`를 참조한다.
 */

export const PARTICIPANT_ROLES = [
  'STARTUP',
  'EXPERT',
  'MENTOR',
  'JUDGE',
  'INVESTOR',
  'STAFF',
  'OBSERVER',
] as const
