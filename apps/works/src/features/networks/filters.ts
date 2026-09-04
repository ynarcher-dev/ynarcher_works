/**
 * NETWORKS 목록 필터 상태 — 원장이 하나이므로 필터도 한 벌이다(2026-09-04 통합).
 *
 * 필터 축은 그 목록에 실제로 노출된 열에서만 고른다. 화면에 없는 값으로 거르면 왜 걸러졌는지
 * 표에서 확인할 수 없다. 예외는 권역 하나다 — 권역은 열로 세우면 국내 행에서 늘 빈 칸이
 * 되므로 열 대신 축으로만 두고, 대신 지역 열이 그 상위 사실(국내/해외·국가명)을 답한다.
 *
 * 만족도 열은 서되 축이 아니다 — 근거 원장이 걷혀(20260903150000) 값이 항상 비어 있고,
 * 거를 수 없는 것으로 거르는 칸은 고를 수 있다고 말하는 죽은 컨트롤이 된다.
 */

/**
 * 통합 목록 필터. 값은 모두 저장값(코드·태그 id)이며 화면에는 라벨이 보인다.
 * 레인지 값은 입력 그대로의 문자열로 들고 있다가 조회 직전에 숫자로 바꾼다 —
 * 빈 칸("경계 없음")과 0을 숫자 타입 하나로는 구분할 수 없다.
 */
export interface NetworkFilterState {
  /** 구분 다중선택(category 코드). 미분류는 자기 메뉴가 있으므로 여기에 두지 않는다. */
  categories: string[]
  /**
   * 지역 다중선택. 값은 DOMESTIC | OVERSEAS | UNSET(국가 미확인)이다.
   * '미확인'을 따로 둔 축이 아니라 같은 물음('어디 사람인가')의 세 번째 답이라 한 축에 담는다 —
   * 옛 데이터를 채워 넣는 작업 대기열이 그 값으로 걸린다.
   */
  regionScopes: string[]
  /** 권역·국가는 태그 FK(id)로 거른다(이름은 조인해서 보여 줄 뿐이다). 해외 전용 축. */
  regionIds: string[]
  countryIds: string[]
  /** 영역(expertise jsonb 배열) — ADMIN 영역 관리(field_tags) 태그명. */
  expertise: string[]
  /** 매칭 가능여부(profile.match_available). 'possible' | 'impossible'. */
  match: string[]
  /** 활동(참여 사업 수) 범위. 집계가 없는 인물은 0건으로 본다. */
  activityMin: string
  activityMax: string
}

export const EMPTY_NETWORK_FILTERS: NetworkFilterState = {
  categories: [],
  regionScopes: [],
  regionIds: [],
  countryIds: [],
  expertise: [],
  match: [],
  activityMin: '',
  activityMax: '',
}

export function hasActiveNetworkFilters(f: NetworkFilterState): boolean {
  return (
    f.categories.length > 0 ||
    f.regionScopes.length > 0 ||
    f.regionIds.length > 0 ||
    f.countryIds.length > 0 ||
    f.expertise.length > 0 ||
    f.match.length > 0 ||
    f.activityMin !== '' ||
    f.activityMax !== ''
  )
}

/** 권역·국가 축을 노출할지 — 지역이 해외를 포함할 때만 뜻이 선다(국내 행에는 권역이 없다). */
export function showsOverseasAxes(f: NetworkFilterState): boolean {
  return f.regionScopes.length === 0 || f.regionScopes.includes('OVERSEAS')
}

/** 지역 축에서 국가 미확인을 뺀 실제 지역 값(서버 인자로 나가는 값). */
export function regionScopeValues(f: NetworkFilterState): string[] {
  return f.regionScopes.filter((v) => v !== 'UNSET')
}

/** 지역 축에 '국가 미확인'이 걸려 있는가. */
export function wantsCountryUnset(f: NetworkFilterState): boolean {
  return f.regionScopes.includes('UNSET')
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
