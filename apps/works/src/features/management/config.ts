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

/**
 * 계정 생성 시 부여 가능한 역할 — `관리자(super_admin)`·`읽기 전용(read_only)`은 제외한다.
 * (표시 라벨용 ROLE_OPTIONS/ROLE_LABELS는 기존 계정 표기를 위해 그대로 유지)
 */
export const CREATABLE_ROLE_OPTIONS = ROLE_OPTIONS.filter(
  (o) => o.value !== 'super_admin' && o.value !== 'read_only',
)

/** user_type → 표시 라벨(배지·상세). ROLE_OPTIONS에서 파생. */
export const ROLE_LABELS: Record<string, string> = Object.fromEntries(
  ROLE_OPTIONS.map((o) => [o.value, o.label]),
)

export type AssetStatus = 'ASSIGNED' | 'AVAILABLE' | 'MAINTENANCE' | 'RETIRED'

/**
 * 상태 라벨. 네 값 모두 두 글자로 맞춘다 — 표에서 한 열에 세로로 쌓이는 말이라 길이가 들쭉날쭉하면
 * 값보다 글자 수가 먼저 눈에 든다. 배지(태그)로 칠하지 않고 텍스트로만 적는다: 상태는 네 값이
 * 대등한 분류이지 좋고 나쁨의 단계가 아니라서, 색을 입히면 없는 위계가 생긴다.
 */
export const ASSET_LABELS: Record<AssetStatus, string> = {
  ASSIGNED: '할당',
  AVAILABLE: '보유',
  MAINTENANCE: '보수',
  RETIRED: '폐기',
}

/**
 * 취득 형태. 화면에서는 '분류'로 부르고 컬럼명은 acquisition_type이다 — 사용자가 쓰는 말과
 * 그 값이 실제로 가르는 것(취득 형태)이 달라서, 양쪽을 각자의 자리에서 정확하게 부른다.
 */
export type AssetAcquisition = 'PURCHASE' | 'LEASE' | 'RENTAL' | 'OTHER'

export const ACQUISITION_LABELS: Record<AssetAcquisition, string> = {
  PURCHASE: '구매',
  LEASE: '리스',
  RENTAL: '렌탈',
  OTHER: '기타',
}

/** 등록 폼 셀렉트 순서(구매가 기본). 라벨은 ACQUISITION_LABELS가 단일 원천이다. */
export const ACQUISITION_ORDER: AssetAcquisition[] = ['PURCHASE', 'LEASE', 'RENTAL', 'OTHER']

/**
 * 금액의 결제 주기. 같은 금액 열에 완납가와 월 구독료가 섞이면 합계가 뜻을 잃으므로,
 * 금액이 어느 주기의 값인지를 함께 적는다. 계약 기간은 취득일자~회수 예정일로 본다.
 */
export type AssetBillingCycle = 'ONE_TIME' | 'MONTHLY' | 'YEARLY'

export const BILLING_LABELS: Record<AssetBillingCycle, string> = {
  ONE_TIME: '완납',
  MONTHLY: '월 구독',
  YEARLY: '연 구독',
}

export const BILLING_ORDER: AssetBillingCycle[] = ['ONE_TIME', 'MONTHLY', 'YEARLY']

/** 상태 셀렉트 순서. 보유 → 할당 → 보수 → 폐기(실물 흐름 순). */
export const ASSET_STATUS_ORDER: AssetStatus[] = [
  'AVAILABLE',
  'ASSIGNED',
  'MAINTENANCE',
  'RETIRED',
]

/**
 * 자산 사진 상한. DB check 제약(assets_photo_paths_max)과 같은 값이며 최종 판정은 DB다.
 * 값 규칙이라 화면·검증·Storage 헬퍼가 함께 보도록 여기(순수 설정)에 둔다.
 */
export const ASSET_PHOTO_MAX = 5

/** 사진 한 장의 원본 파일 크기 상한(회의실 사진과 같은 기준). */
export const ASSET_PHOTO_MAX_BYTES = 5_000_000
