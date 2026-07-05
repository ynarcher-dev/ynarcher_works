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
