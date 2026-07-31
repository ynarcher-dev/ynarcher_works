/**
 * NETWORKS 목록 필터 상태 — 국내 9종(디렉토리)과 글로벌 네트워크가 각자 다른 축을 쓴다.
 *
 * 필터 축은 그 목록에 실제로 노출된 열에서만 고른다. 화면에 없는 값으로 거르면 왜 걸러졌는지
 * 표에서 확인할 수 없다. 그래서 프로필형(전문가·BAN·EXP·투자사)만 분야·매칭 필터를 갖고,
 * 조직형(기업·기관·대학·기타)과 미분류는 구분 하나만 갖는다(그 목록에 있는 열이 그것뿐이다).
 */

/** 국내 네트워크(9종) 필터. 값은 모두 화면에 보이는 표기 그대로다(태그명·라벨). */
export interface NetworkFilterState {
  /** 구분(profile.category) — ADMIN 구분 관리(category_tags) 태그명. */
  categories: string[]
  /** 분야(expertise jsonb 배열) — ADMIN 분야 관리(field_tags) 태그명. 프로필형 전용. */
  expertise: string[]
  /** 매칭 가능여부(profile.match_available). 'possible' | 'impossible'. 프로필형 전용. */
  match: string[]
}

export const EMPTY_NETWORK_FILTERS: NetworkFilterState = {
  categories: [],
  expertise: [],
  match: [],
}

export function hasActiveNetworkFilters(f: NetworkFilterState): boolean {
  return f.categories.length > 0 || f.expertise.length > 0 || f.match.length > 0
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

/** 내 네트워크(10종 통합) 필터. 종류가 섞인 목록이라 '어느 네트워크인가'가 첫 축이다. */
export interface MyNetworkFilterState {
  /** 원장 테이블(EntityKey) 다중선택. */
  entities: string[]
  categories: string[]
}

export const EMPTY_MY_NETWORK_FILTERS: MyNetworkFilterState = { entities: [], categories: [] }

export function hasActiveMyNetworkFilters(f: MyNetworkFilterState): boolean {
  return f.entities.length > 0 || f.categories.length > 0
}
