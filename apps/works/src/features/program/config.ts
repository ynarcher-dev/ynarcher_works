import { moduleTypeLabel } from '@ynarcher/master-data'
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

/**
 * 기본 템플릿 3종 — 구 '커스텀 활동' 하나를 저장 대상별로 가른 것(2026-08-03).
 *
 * 한 템플릿이 "정형에 속하지 않는 모든 것"을 받아 내던 시절에는 글·링크·파일이 한 화면에
 * 섞여, 무엇을 남기러 들어온 화면인지가 열어 봐야만 드러났다. 셋은 남기는 것도 다르고
 * 여는 방식도 다르므로(글은 전체 화면, 링크·파일은 모달) 템플릿 자체를 가른다.
 * 어떤 활동인지 정하지 못했을 때의 출발점은 셋 중 가장 범용인 글쓰기다.
 */
export const BASE_MODULE_TYPES: ModuleTypeDef[] = [
  { type: 'POST', label: moduleTypeLabel('POST'), implemented: true },
  { type: 'LINK', label: moduleTypeLabel('LINK'), implemented: true },
  { type: 'FILE', label: moduleTypeLabel('FILE'), implemented: true },
]

/** 기본 템플릿 여부(모듈 추가 모달의 '기본 템플릿' 섹션 대상). */
export function isBaseModuleType(moduleType: string): boolean {
  return BASE_MODULE_TYPES.some((d) => d.type === moduleType)
}

/**
 * 모듈 보드에 서는 템플릿 순서. 라벨은 `@ynarcher/master-data`의 공통 어휘가 소유한다 —
 * 같은 모듈이 GUEST 사이드바에도 서므로, 이름을 두 벌 들면 두 화면이 다른 말을 하게 된다.
 */
export const MODULE_TYPES: ModuleTypeDef[] = ['RECRUITMENT']
  .map((type) => ({ type, label: moduleTypeLabel(type), implemented: true }))
  .concat(BASE_MODULE_TYPES)

/**
 * 모듈 공유 범위 — **이 모듈이 어디까지 나가는가**를 답하는 한 축이며 세 값은 서로 배타다.
 *
 * 2026-09-02에는 '누가 보는가'(공유 범위)와 '바깥에 문을 여는가'(링크 공유)를 두 축으로 갈랐으나,
 * 갈라 놓으니 담당자가 만질 스위치가 둘이 되어 **PUBLIC을 걷어내며 없앴던 오인이 이름만 바꿔
 * 되살아났다**(전체공개를 골랐는데 아무 일도 안 일어남). 2026-09-03에 한 축으로 되합치고
 * 세 번째 값 `PUBLIC_LINK`를 세운다.
 *
 * **값은 담당자가 고르지 않는다** — ADMIN이 템플릿에 성격을 지정하고(`module_templates.visibility`),
 * 화면은 그 템플릿에서 고를 수 있는 값만 세운다(`moduleVisibilityOptions`). 폐기된 `PUBLIC`은
 * enum에 남아 있으나 CHECK가 저장을 막는다.
 * 근거: docs/docs_planning/3_4_15_ac_public_links.md
 */
export const MODULE_VISIBILITY_OPTIONS = [
  { value: 'PUBLIC_LINK', label: 'PUBLIC_LINK', hint: '주소를 아는 누구나(로그인 불필요)' },
  { value: 'GUEST_ONLY', label: 'WORKS+GUEST', hint: 'GUEST 포털의 참여 기업/전문가까지' },
  { value: 'INTERNAL_ONLY', label: 'WORKS ONLY', hint: 'WORKS 내부 운영자만' },
] as const

export const MODULE_VISIBILITY_LABEL: Record<string, string> = {
  PUBLIC_LINK: 'PUBLIC_LINK',
  GUEST_ONLY: 'WORKS+GUEST',
  INTERNAL_ONLY: 'WORKS ONLY',
}

export const MODULE_VISIBILITY_TONE: Record<string, BadgeTone> = {
  PUBLIC_LINK: 'warning',
  GUEST_ONLY: 'info',
  INTERNAL_ONLY: 'neutral',
}

/**
 * 모듈 카드의 공유 범위 배지 — **배지는 성격을, 톤은 지금을 말한다.**
 *
 * 축이 하나가 되었으므로 `PUBLIC_LINK` 배지 자체가 "밖으로 나가는 모듈"을 말한다(2026-09-03
 * 개정 전에는 공유 범위 배지와 링크 배지가 나란히 섰다). 다만 그 모듈이라도 공개 상태가
 * 비공개거나 기간 밖이면 실제로는 닫혀 있으므로, **실제로 열려 있는 것만 강조 톤**을 준다 —
 * 배지만 보고 "지금 열려 있다"로 읽히면 담당자가 사업을 훑을 때 열린 문의 개수를 잘못 센다.
 */
export function moduleVisibilityBadge(
  visibility: string,
  linkOpen: boolean,
): { label: string; tone: BadgeTone } {
  const label = MODULE_VISIBILITY_LABEL[visibility] ?? 'WORKS ONLY'
  if (visibility === 'PUBLIC_LINK' && !linkOpen) return { label, tone: 'neutral' }
  return { label, tone: MODULE_VISIBILITY_TONE[visibility] ?? 'neutral' }
}

/**
 * 이 템플릿에서 고를 수 있는 공유 범위. DB의 `app.module_template_visibilities()`와 같은 표이며,
 * 서버가 트리거로 최종 강제한다 — 화면에서 감추는 것은 보안이 아니다.
 *
 * `PUBLIC_LINK`는 상한이 아니라 **배타**다: 그 성격의 템플릿에서는 다른 값을 고를 수 없다.
 * 모집으로 받아 선발하고 계정을 발급해야 GUEST 활동이 시작되므로, 한 모듈이 두 구간에 동시에
 * 설 수 없기 때문이다(구간이 바뀔 때 이동하는 것은 모듈이 아니라 사람이다).
 */
export function moduleVisibilityOptions(templateVisibility: string | undefined) {
  if (templateVisibility === 'PUBLIC_LINK') {
    return MODULE_VISIBILITY_OPTIONS.filter((v) => v.value === 'PUBLIC_LINK')
  }
  if (templateVisibility === 'GUEST_ONLY') {
    return MODULE_VISIBILITY_OPTIONS.filter((v) => v.value !== 'PUBLIC_LINK')
  }
  return MODULE_VISIBILITY_OPTIONS.filter((v) => v.value === 'INTERNAL_ONLY')
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
 * 운영자가 그 범위 안에서 선택할 수 있다. 나머지는 고정.
 *
 * 2026-09-03 — 정형 운영 모듈 7종을 걷으면서 선택형(비즈니스 매칭)이 사라져, 지금은
 * 모든 템플릿이 고정 기본값만 갖는다. `options`를 다루는 갈래는 남겨 둔다 — 배정 방식이
 * 여러 개일 수 있다는 것은 이 표의 성질이지 지금 남은 네 종류의 사정이 아니다.
 * 근거: docs/docs_planning/3_4_2_ac_program_overview.md §6.3
 */
export const MODULE_PARTICIPATION: Record<string, { default: string; options?: string[] }> = {
  RECRUITMENT: { default: 'OPEN_APPLICATION' },
  // 기본 템플릿 3종은 운영자가 직접 남기는 기록이라 배정 개념이 없다.
  POST: { default: 'ADMIN_ONLY' },
  LINK: { default: 'ADMIN_ONLY' },
  FILE: { default: 'ADMIN_ONLY' },
}

/** 모듈 타입의 강제 배정 방식 기본값(미정의 타입은 null). */
export function defaultParticipationMode(moduleType: string): string | null {
  return MODULE_PARTICIPATION[moduleType]?.default ?? null
}

/**
 * 프로그램(프로젝트) 상태 수명주기:
 *   [제안 단계] 시도 → 선정 ┈▶ [운영 단계] 준비 → 진행중 → 종료 / (중단) 취소
 *              ↘ (미선정) 미선정 … 프로젝트 종료(terminal)
 * 선정(제안이 통과함)과 준비(운영 채비를 함)는 서로 다른 사실이라 자동으로 넘어가지 않는다 —
 * 자동 전환하면 선정만 되고 아직 착수하지 않은 사업이 원장에 남지 않아 목록·집계에서 가려낼 수 없다.
 *
 * **이 흐름은 권장 경로이지 강제 순서가 아니다(2026-08-21).** 이전에는 등록 폼이 단계 라디오로
 * 순서를 잠가, 운영 상태를 고르려면 먼저 제안을 '선정'으로 만들어야 했다. 그런데 원장에는 그런
 * 제약이 없었고(두 원장의 CHECK 제약은 M&A·PROJECT에서 제안 상태를 금지할 뿐 전이 순서는 보지
 * 않는다) 저장되는 값도 상태 하나뿐이라, 그 잠금은 데이터를 지켜 주지 못하면서 등록만 어렵게
 * 했다. 지금은 어느 워크스페이스에서든 상태 셀렉트 하나로 고르며, 단계는 고르는 것이 아니라
 * 상태에서 따라 나온다(`programStage()`). 단계라는 사실 자체는 남는다 — AC의 셀렉트는
 * `optgroup`으로 두 묶음을 갈라 보여주고, 진행 현황도 계속 두 줄로 그린다.
 *
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

/**
 * 프로그램 상태 배지 톤(상세 헤더·목록 배지·프로세스 뷰의 막대와 아이콘 공용).
 *
 * 색이 답하는 것은 '어느 단계인가'가 아니라 **'지금 어떤 성격인가'**다.
 *   대기(warning) · 아직(neutral) · 굴러감(info) · 잘 끝남(success) · 엎어짐(danger)
 * 근거: docs_design/4_color_system_rules.md §3.1 — 사업 진행 중은 info, 최종 선정은 success,
 * 심사 탈락·취소/중단은 danger, 검토 대기는 warning으로 명시되어 있다.
 *
 * 상태 7종에 톤 5종이므로 겹침은 피할 수 없다. 그래서 겹치는 자리를 고른다 — **제안 단계의
 * 결말과 운영 단계의 결말이 서로 같은 색을 쓴다**(선정·종료=success, 미선정·취소=danger).
 * 두 단계가 같은 모양의 끝을 가지므로 색이 대칭을 이루고, 겹치는 둘은 흐름에서 나란히 서지
 * 않아 한 화면에서 헷갈릴 일이 없다.
 *
 * 2026-08-03 정정: 진행중이 success여서 선정과 같은 초록이었고(목록에서 둘을 색으로 가릴 수
 * 없었다), 미선정이 warning이어서 '아직 뭔가 기다리는 중'으로 읽혔다. 위 두 축으로 다시 폈다.
 * 색만으로 구분하지 않는다는 §4.2 규정은 배지의 라벨과 프로세스 뷰의 단계 아이콘이 지킨다.
 */
export const PROGRAM_STATUS_TONE: Record<string, BadgeTone> = {
  PROPOSED: 'warning',
  SELECTED: 'success',
  NOT_SELECTED: 'danger',
  DRAFT: 'neutral',
  OPERATING: 'info',
  FINISHED: 'success',
  CANCELLED: 'danger',
  // 구 상태값 — 셋 다 운영이 굴러가던 중의 표기라 진행(info)으로 함께 묶는다.
  // 종전에 심사·데모데이가 warning이었던 것은 이 표에서 노랑이 '대기'를 뜻하기 전의 잔재다.
  RECRUITING: 'info',
  SCREENING: 'info',
  DEMO_DAY: 'info',
}

/**
 * 사업구분(category)은 워크스페이스마다 값이 다르므로 각 워크스페이스 config가 단일 원천이다.
 * AC는 features/ac/AcWorkspace.tsx, M&A는 features/mna/MnaWorkspace.tsx,
 * PROJECT는 features/project/ProjectWorkspace.tsx의 `categories`를 참조한다.
 */

/**
 * 분야 태그(industry_tags) 다중 선택 상한. 스타트업 원장(MAX_INDUSTRIES)과 같은 값이다 —
 * 같은 태그 원장을 읽는 두 축이 서로 다른 상한을 가지면 "이 사업이 노린 분야"와
 * "실제로 발굴한 기업의 분야"를 나란히 놓고 읽을 때 폭이 어긋난다.
 */
export const MAX_PROGRAM_INDUSTRIES = 3

/**
 * 주관(host_organization) 자리에 '바깥에서 받은 사업이 아니다'를 적는 값.
 *
 * 별도 boolean 컬럼을 두지 않고 주관 칸의 값 하나로 적는다 — 그 열이 답하는 질문은
 * "누가 준 사업인가"이고 자체 프로젝트는 그 질문의 답 중 하나이기 때문이다. 플래그를 따로
 * 두면 목록·상세·업로드·통합검색이 매번 두 값을 합쳐 읽어야 하고, 둘이 어긋난 행
 * (자체=true인데 기관명도 채워진)이 언제든 생긴다. 지금 구조에서는 어긋날 값이 없다.
 *
 * 화면에 그대로 노출되는 문구이므로 표시용 라벨과 저장값이 같다 — 목록·상세는 이 값을
 * 특별히 몰라도 되고, 대용량 업로드도 같은 말을 그대로 적으면 그대로 들어온다.
 */
export const SELF_HOSTED_PROGRAM_HOST = '자체 프로젝트'
