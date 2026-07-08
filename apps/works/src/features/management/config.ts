import type { BadgeTone } from '@ynarcher/ui'

export type ApprovalStatus =
  | 'DRAFT'
  | 'PENDING'
  | 'IN_REVIEW'
  | 'APPROVED'
  | 'REJECTED'

export const APPROVAL_LABELS: Record<ApprovalStatus, string> = {
  DRAFT: '임시저장',
  PENDING: '상신',
  IN_REVIEW: '1차 검토',
  APPROVED: '최종 승인',
  REJECTED: '반려',
}

export const approvalTone: Record<ApprovalStatus, BadgeTone> = {
  DRAFT: 'neutral',
  PENDING: 'info',
  IN_REVIEW: 'warning',
  APPROVED: 'success',
  REJECTED: 'danger',
}

export const FORM_TYPES = [
  { key: 'INVESTMENT', label: '투자 심의 승인서' },
  { key: 'BUDGET', label: '예산 집행 요청서' },
  { key: 'EXPENSE', label: '비용 청구서' },
  { key: 'GENERAL', label: '일반 품의서' },
] as const

/**
 * 임직원 역할(user_type) 선택지 — 내부 임직원 유형만(외부 게스트 유형 제외).
 * Edge Function `employee-create`의 INTERNAL_ROLES와 대응한다.
 */
export const ROLE_OPTIONS: { value: string; label: string }[] = [
  { value: 'super_admin', label: '관리자' },
  { value: 'executive', label: '경영진' },
  { value: 'management_support', label: '경영지원' },
  { value: 'fund_manager', label: '투자실' },
  { value: 'ac_business', label: 'AC 사업부' },
  { value: 'mna_manager', label: 'M&A팀' },
  { value: 'project_manager', label: '프로젝트팀' },
  { value: 'read_only', label: '읽기 전용' },
]

/** user_type → 표시 라벨(배지·상세). ROLE_OPTIONS에서 파생. */
export const ROLE_LABELS: Record<string, string> = Object.fromEntries(
  ROLE_OPTIONS.map((o) => [o.value, o.label]),
)

export type AssetStatus = 'ASSIGNED' | 'AVAILABLE' | 'MAINTENANCE' | 'RETIRED'

export const ASSET_LABELS: Record<AssetStatus, string> = {
  ASSIGNED: '할당됨',
  AVAILABLE: '가용',
  MAINTENANCE: '유지보수',
  RETIRED: '폐기',
}

export const assetTone: Record<AssetStatus, BadgeTone> = {
  ASSIGNED: 'info',
  AVAILABLE: 'success',
  MAINTENANCE: 'warning',
  RETIRED: 'neutral',
}
