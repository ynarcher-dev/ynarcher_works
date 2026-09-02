/**
 * NETWORKS 목록 필터 상태 — 국내 통합 목록과 글로벌 네트워크가 각자 다른 축을 쓴다.
 *
 * 필터 축은 그 목록에 실제로 노출된 열에서만 고른다. 화면에 없는 값으로 거르면 왜 걸러졌는지
 * 표에서 확인할 수 없다. 국내 통합 목록은 영역·활동·매칭을 축으로 갖고(조직형 행은 값이
 * 비어 자연히 걸러진다), 미분류 데이터베이스는 열이 전부 인적사항이라 축이 없다(검색어
 * 하나로 닿는다). 만족도 열은 서되 축이 아니다 — 근거 원장이 걷혀(20260903150000) 값이
 * 항상 비어 있고, 거를 수 없는 것으로 거르는 칸은 고를 수 있다고 말하는 죽은 컨트롤이 된다.
 *
 * 국내에서 '구분' 축은 원장 테이블로 판정한다(`profile.category`가 아니라) — 그 값이 행이
 * 놓인 원장의 라벨과 같아 둘을 나란히 두면 같은 것을 두 번 묻게 된다. 글로벌은 반대로 한
 * 원장에 3분류가 섞여 있어 구분이 스칼라 컬럼이며, 자기 필터 상태에 그 축을 갖는다.
 */

/**
 * 국내 네트워크 공용 필터 축(영역·매칭·활동). 값은 모두 화면에 보이는 표기
 * 그대로다(태그명·라벨). 레인지 값은 입력 그대로의 문자열로 들고 있다가 조회 직전에 숫자로
 * 바꾼다 — 빈 칸("경계 없음")과 0을 숫자 타입 하나로는 구분할 수 없다.
 */
export interface NetworkFilterState {
  /** 영역(expertise jsonb 배열) — ADMIN 영역 관리(field_tags) 태그명. 프로필형 전용. */
  expertise: string[]
  /** 매칭 가능여부(profile.match_available). 'possible' | 'impossible'. 프로필형 전용. */
  match: string[]
  /** 활동(참여 사업 수) 범위. 집계가 없는 인물은 0건으로 본다. */
  activityMin: string
  activityMax: string
}

export const EMPTY_NETWORK_FILTERS: NetworkFilterState = {
  expertise: [],
  match: [],
  activityMin: '',
  activityMax: '',
}

export function hasActiveNetworkFilters(f: NetworkFilterState): boolean {
  return (
    f.expertise.length > 0 ||
    f.match.length > 0 ||
    f.activityMin !== '' ||
    f.activityMax !== ''
  )
}

/**
 * 검색어가 닿는 민감 필드 범위. ADMIN 민감정보 정책이 공개로 연 필드만 켠다 —
 * 가려진 값을 검색으로 되짚을 수 있으면 마스킹이 무력해진다. 서버(RPC)에서도 같은 인자로 강제한다.
 */
export interface NetworkSearchScope {
  email: boolean
  phone: boolean
}

export const CLOSED_SEARCH_SCOPE: NetworkSearchScope = { email: false, phone: false }

/**
 * 검색 자리표시자 문구. 검색되지 않는 필드를 안내에 적어 두면 "쳤는데 왜 안 나오나"가 되므로,
 * 실제 검색 범위(정책에 따라 늘고 준다)를 그대로 읽어 만든다.
 */
export function searchPlaceholderFor(scope: NetworkSearchScope): string {
  const fields = ['이름', '소속']
  if (scope.email) fields.push('이메일')
  if (scope.phone) fields.push('연락처')
  return `${fields.join('·')} 검색`
}

/** 매칭 필터 옵션. 값이 비어 있는 행은 '가능'으로 본다(목록 배지와 같은 규칙). */
export const MATCH_FILTER_OPTIONS = [
  { value: 'possible', label: '가능' },
  { value: 'impossible', label: '불가능' },
]

/** 글로벌 네트워크 필터. 권역·국가는 태그 FK(id)로 거른다(이름은 조인해서 보여 줄 뿐이다). */
export interface GlobalFilterState {
  regionIds: string[]
  countryIds: string[]
  /** 구분(category) — 고정 3값(기업/기관/투자자). */
  categories: string[]
}

export const EMPTY_GLOBAL_FILTERS: GlobalFilterState = {
  regionIds: [],
  countryIds: [],
  categories: [],
}

export function hasActiveGlobalFilters(f: GlobalFilterState): boolean {
  return f.regionIds.length > 0 || f.countryIds.length > 0 || f.categories.length > 0
}

/**
 * 국내 통합 목록('내 업로드 DB (국내)' / '전체 네트워크 (국내)') 필터.
 *
 * 첫 축이 다른 목록과 다르다 — 여기서만 원장이 섞여 있으므로 '어느 구분인가'가 축이다.
 * 값은 원장 테이블명으로 들고 있고 화면에는 구분 이름만 보인다. `profile.category`를 따로
 * 두지 않는 이유는 그 값이 행이 놓인 원장의 라벨과 같기 때문이다 — 같은 것을 두 번 묻는
 * 셈이라 두 축을 함께 골라야 결과가 나오고 엇갈리면 0건이 됐다. 게다가 그 선택지는 ADMIN
 * 구분 원장 전체라 이 목록에 있을 수 없는 값(임직원·게스트 등)까지 섞였다.
 *
 * 나머지 축(영역·매칭·활동)은 원장별 목록이 갖고 있던 것을 그대로 물려받았다
 * (2026-08-20, 원장별 사이드바 메뉴 폐지). 이 목록이 그 열을 세우므로 축으로 둘 수 있다 —
 * 화면에 없는 값으로 거르면 왜 걸러졌는지 표에서 확인할 방법이 없다는 규칙은 그대로다.
 * 조직형(기업·기관·대학·기타) 행은 그 열이 비어 있어 이 축으로 거르면 자연히 빠진다.
 */
export interface NetworkListFilterState extends NetworkFilterState {
  /** 구분 다중선택. 값은 원장 테이블명(EntityKey)이고 화면에는 구분 이름만 보인다. */
  entities: string[]
}

export const EMPTY_NETWORK_LIST_FILTERS: NetworkListFilterState = {
  ...EMPTY_NETWORK_FILTERS,
  entities: [],
}

export function hasActiveNetworkListFilters(f: NetworkListFilterState): boolean {
  return f.entities.length > 0 || hasActiveNetworkFilters(f)
}
