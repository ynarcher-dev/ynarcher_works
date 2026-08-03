/**
 * NETWORKS 목록 필터 상태 — 국내 9종(디렉토리)과 글로벌 네트워크가 각자 다른 축을 쓴다.
 *
 * 필터 축은 그 목록에 실제로 노출된 열에서만 고른다. 화면에 없는 값으로 거르면 왜 걸러졌는지
 * 표에서 확인할 수 없다. 그래서 프로필형(전문가·BAN·EXP·투자사)만 영역·매칭·활동·만족도 필터를
 * 갖고, 조직형(기업·기관·대학·기타)과 미분류는 필터 축이 없다(그 목록의 열이 전부 인적사항이라
 * 검색어 하나로 닿는다).
 *
 * 구분(profile.category)은 디렉토리에서 축이 아니다 — 목록 하나가 곧 구분 하나라 어느 값을
 * 골라도 결과가 그대로거나 0건이다. 구분이 결과를 가르는 곳은 원장이 섞인 목록(내 네트워크)과
 * 한 원장에 3분류가 섞인 글로벌 네트워크뿐이며, 각각 자기 필터 상태에 그 축을 갖는다.
 */

/**
 * 국내 네트워크(9종) 필터. 값은 모두 화면에 보이는 표기 그대로다(태그명·라벨).
 * 레인지 값은 입력 그대로의 문자열로 들고 있다가 조회 직전에 숫자로 바꾼다 —
 * 빈 칸("경계 없음")과 0을 숫자 타입 하나로는 구분할 수 없다.
 */
export interface NetworkFilterState {
  /** 영역(expertise jsonb 배열) — ADMIN 영역 관리(field_tags) 태그명. 프로필형 전용. */
  expertise: string[]
  /** 매칭 가능여부(profile.match_available). 'possible' | 'impossible'. 프로필형 전용. */
  match: string[]
  /** 활동(참여 사업 수) 범위. 집계가 없는 인물은 0건으로 본다. */
  activityMin: string
  activityMax: string
  /** 만족도(멘토 평가 평균, 5점 만점) 범위. 평가가 없는 인물은 어느 경계로도 잡히지 않는다. */
  satisfactionMin: string
  satisfactionMax: string
}

export const EMPTY_NETWORK_FILTERS: NetworkFilterState = {
  expertise: [],
  match: [],
  activityMin: '',
  activityMax: '',
  satisfactionMin: '',
  satisfactionMax: '',
}

export function hasActiveNetworkFilters(f: NetworkFilterState): boolean {
  return (
    f.expertise.length > 0 ||
    f.match.length > 0 ||
    f.activityMin !== '' ||
    f.activityMax !== '' ||
    f.satisfactionMin !== '' ||
    f.satisfactionMax !== ''
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
 * 내 네트워크(디렉토리 10종 + 글로벌 통합) 필터.
 *
 * 축은 '어느 네트워크인가' 하나다. 구분(profile.category)을 따로 두지 않는 이유는 그 값이
 * 행이 놓인 원장의 라벨과 같기 때문이다 — 같은 것을 두 번 묻는 셈이라 '전문가 네트워크'와
 * 구분 '전문가'를 함께 골라야 결과가 나오고 엇갈리면 0건이 됐다. 게다가 구분 선택지는 ADMIN
 * 구분 원장 전체라 이 목록에 있을 수 없는 값(임직원·게스트 등)까지 섞였다.
 */
export interface MyNetworkFilterState {
  /** 원장 테이블(EntityKey + 'global_networks') 다중선택. */
  entities: string[]
}

export const EMPTY_MY_NETWORK_FILTERS: MyNetworkFilterState = { entities: [] }

export function hasActiveMyNetworkFilters(f: MyNetworkFilterState): boolean {
  return f.entities.length > 0
}

/** 글로벌 네트워크의 원장 키. 디렉토리 9종과 달리 EntityKey 밖에 있는 단일 원장이다. */
export const GLOBAL_ENTITY_KEY = 'global_networks'
