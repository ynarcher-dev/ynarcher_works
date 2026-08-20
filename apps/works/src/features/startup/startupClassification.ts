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
 * 구분 코드 → 민감정보 정책 콘텐츠 키(ADMIN '민감정보 관리').
 * 키 이름은 구분별 메뉴가 있던 시절의 탭 이름(discovered/etc)을 그대로 둔다 — 정책은 DB에
 * 이 키로 저장되어 있어 이름을 바꾸면 기존 설정이 통째로 끊긴다. 메뉴는 사라졌지만 이 키가
 * 답하는 자리는 남아 있다(구분이 하나로 정해지는 곳 = 기업 상세, 전역 검색의 구분별 결과).
 */
const CONTENT_KEY_BY_STATUS: Record<ManagementStatus, string> = {
  invested: 'startup.invested',
  incubated: 'startup.incubated',
  sourced: 'startup.discovered',
  other: 'startup.etc',
}

/**
 * 구분이 없거나 섞인 뷰의 콘텐츠 키. 목록은 '내 업로드 DB'와 '스타트업 DB' 둘이며,
 * 같은 화면을 범위만 넓혀 쓰지만 정책은 따로 걸 수 있어야 하므로 키를 나눈다.
 */
const CONTENT_KEY_BY_SCOPE = { mine: 'startup.mine', all: 'startup.all' } as const

/** 목록 범위. '내 업로드 DB'(mine)와 '스타트업 DB'(all) 둘뿐이다. */
export type StartupListScope = keyof typeof CONTENT_KEY_BY_SCOPE

/**
 * 목록 화면의 콘텐츠 키. 목록은 구분을 고정하지 않으므로(구분은 필터 축) 범위 하나로 갈린다.
 */
export function startupListContentKey(scope: StartupListScope): string {
  return CONTENT_KEY_BY_SCOPE[scope]
}

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
