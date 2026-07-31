/**
 * 스타트업 구분(management_status) 코드 체계 단일 원천.
 * 기획: docs/docs_planning/3_3_1_startup_pool_classification.md
 * DB는 코드값(sourced/incubated/invested/other)을 저장하고, 화면 라벨은 여기서만 매핑한다.
 */

export type ManagementStatus = 'sourced' | 'incubated' | 'invested' | 'other'

export const MANAGEMENT_STATUSES: ManagementStatus[] = ['sourced', 'incubated', 'invested', 'other']

/** 구분 코드 → 한글 라벨. */
export const MANAGEMENT_STATUS_LABEL: Record<ManagementStatus, string> = {
  sourced: '발굴기업',
  incubated: '보육기업',
  invested: '투자기업',
  other: '기타기업',
}

export type BadgeTone = 'neutral' | 'info' | 'success' | 'warning'

/** 구분 코드 → 배지 톤. */
export const MANAGEMENT_STATUS_TONE: Record<ManagementStatus, BadgeTone> = {
  sourced: 'neutral',
  incubated: 'info',
  invested: 'success',
  other: 'warning',
}

/** 셀렉트/옵션용 (코드·라벨) 목록(정렬 순서 고정). */
export const MANAGEMENT_STATUS_OPTIONS: { value: ManagementStatus; label: string }[] =
  MANAGEMENT_STATUSES.map((value) => ({ value, label: MANAGEMENT_STATUS_LABEL[value] }))

/**
 * 사이드바 탭(tab) → 구분 코드. 4개 메뉴는 상호 배타적 필터 뷰다.
 * 발굴기업(discovered) = sourced 만.
 */
export const TAB_TO_STATUS: Record<string, ManagementStatus> = {
  invested: 'invested',
  incubated: 'incubated',
  discovered: 'sourced',
  etc: 'other',
}

/**
 * 구분 코드 → 민감정보 정책 콘텐츠 키(ADMIN '민감정보 관리').
 * 정책은 코드값이 아니라 사이드바 메뉴 기준이라 탭 이름(discovered/etc)을 키로 쓴다.
 */
const CONTENT_KEY_BY_STATUS: Record<ManagementStatus, string> = {
  invested: 'startup.invested',
  incubated: 'startup.incubated',
  sourced: 'startup.discovered',
  other: 'startup.etc',
}

/**
 * 구분이 없거나 섞인 뷰의 콘텐츠 키. 구분 무관 목록은 '내 기업 관리'와 '전체 기업' 둘이며,
 * 같은 화면을 범위만 넓혀 쓰지만 정책은 따로 걸 수 있어야 하므로 키를 나눈다.
 */
const CONTENT_KEY_BY_SCOPE = { mine: 'startup.mine', all: 'startup.all' } as const

/**
 * 구분 코드 → 콘텐츠 키. 구분이 없으면(구분 무관 목록) 범위로 갈린다.
 * `scope`는 구분이 지정된 경우에는 쓰이지 않는다 — 그때는 메뉴가 구분 하나로 정해진다.
 */
export function startupContentKey(status: unknown, scope: 'mine' | 'all' = 'mine'): string {
  if (typeof status === 'string' && status in CONTENT_KEY_BY_STATUS) {
    return CONTENT_KEY_BY_STATUS[status as ManagementStatus]
  }
  return CONTENT_KEY_BY_SCOPE[scope]
}

/** 구분 값(코드) → 한글 라벨. 미매핑/빈값은 null. */
export function managementStatusLabel(v: unknown): string | null {
  if (typeof v !== 'string' || v === '') return null
  return MANAGEMENT_STATUS_LABEL[v as ManagementStatus] ?? v
}

/** 투자기업 여부. 담당자·관리현황 규칙의 분기 기준. */
export function isInvested(v: unknown): boolean {
  return v === 'invested'
}
