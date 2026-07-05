import type { BadgeTone } from '@ynarcher/ui'

/** M&A 딜 진행 단계 정의(칸반 열 구성 근거: 3_6_workspace_ma.md §1.1). */
export type DealStage =
  | 'SOURCING'
  | 'PRE_DD'
  | 'DD'
  | 'NEGOTIATION'
  | 'CLOSING'
  | 'COMPLETED'
  | 'ABORTED'

export const STAGE_LABELS: Record<DealStage, string> = {
  SOURCING: '소싱',
  PRE_DD: '예비 실사',
  DD: '정밀 실사',
  NEGOTIATION: '조건 협상',
  CLOSING: '계약',
  COMPLETED: '완료',
  ABORTED: '무산',
}

/** 칸반 보드 열 순서(완료/무산은 마지막 종료 열에서 함께 노출). */
export const KANBAN_STAGES: DealStage[] = [
  'SOURCING',
  'PRE_DD',
  'DD',
  'NEGOTIATION',
  'CLOSING',
]

export const TERMINAL_STAGES: DealStage[] = ['COMPLETED', 'ABORTED']

/** 진행 순서상 다음 단계(칸반 카드 이동 버튼 근거). */
export const NEXT_STAGE: Partial<Record<DealStage, DealStage>> = {
  SOURCING: 'PRE_DD',
  PRE_DD: 'DD',
  DD: 'NEGOTIATION',
  NEGOTIATION: 'CLOSING',
  CLOSING: 'COMPLETED',
}

export const DOC_TYPES = [
  { key: 'NDA', label: '비밀유지약정(NDA)' },
  { key: 'MOU', label: '예비 양해각서(MOU)' },
  { key: 'SHAREHOLDER_CONSENT', label: '주주 동의서' },
  { key: 'DD_REPORT', label: '실사 의견서' },
  { key: 'OTHER', label: '기타' },
] as const

export type DocType = (typeof DOC_TYPES)[number]['key']

export const stageTone: Record<DealStage, BadgeTone> = {
  SOURCING: 'neutral',
  PRE_DD: 'info',
  DD: 'info',
  NEGOTIATION: 'warning',
  CLOSING: 'warning',
  COMPLETED: 'success',
  ABORTED: 'danger',
}
