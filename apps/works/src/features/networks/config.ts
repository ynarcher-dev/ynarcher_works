import type { MaskKind, MasterColumn } from '@/features/master/types'
import {
  NETWORK_ORG_COLUMNS,
  NETWORK_PROFILE_COLUMNS,
  NETWORK_UNCLASSIFIED_COLUMNS,
} from '@/features/master/networkProfileColumns'

/**
 * NETWORKS 통합 원장.
 *
 * 종전에는 구분마다 물리 테이블이 있었고(국내 10종) 해외는 별도 원장이었다. 2026-09-04에
 * `public.networks` 하나로 합치고 **구분(category)과 국가(country_tag_id)를 직교한 두 축**으로
 * 세웠다 — 그래야 해외 대학·국내 기업이 같은 문법으로 선다. 한국도 다른 나라와 같은 국가
 * 한 줄이며, 국내/해외(region_scope)는 그 국가에서 파생되는 값이라 사람이 고르지 않는다.
 * 설계 정본: docs/docs_planning/3_3_4_networks_unified_ledger.md
 */
export const NETWORK_TABLE = 'networks'

/** 권역/국가 기준정보 태그 테이블(ADMIN 관리). 국가는 전 행이 갖고, 권역은 국가가 갖는다. */
export const REGION_TAG_TABLE = 'region_tags'
export const COUNTRY_TAG_TABLE = 'country_tags'

/**
 * 구분 코드. 값은 원장 컬럼 `category`에 그대로 저장되며 라벨은 이 파일이 소유한다.
 * `null`은 미분류(분류 전 임시 상태)이므로 이 타입에 넣지 않는다 — 값이 없다는 사실을
 * 값 하나로 표현하면 "미분류라는 구분"이 생겨 다시 카테고리가 된다.
 */
export type NetworkCategory =
  | 'experts'
  | 'van'
  | 'exp'
  | 'investors'
  | 'corporates'
  | 'institutions'
  | 'universities'
  | 'etc'
  | 'vendors'

/** 국내/해외. 국가에서 파생되어 저장되는 값이며 화면이 직접 고르지 않는다. */
export type RegionScope = 'DOMESTIC' | 'OVERSEAS'

export const REGION_SCOPE_LABEL: Record<RegionScope, string> = {
  DOMESTIC: '국내',
  OVERSEAS: '해외',
}

/**
 * 목록의 지역 필터 선택지. 'UNSET'은 저장값이 아니라 조회 축이다 — 국가를 아직 모르는
 * 옛 데이터를 모아 채워 넣는 자리이며, 같은 물음의 세 번째 답이라 별도 축을 만들지 않는다.
 */
export const REGION_SCOPE_OPTIONS: { value: RegionScope | 'UNSET'; label: string }[] = [
  { value: 'DOMESTIC', label: '국내' },
  { value: 'OVERSEAS', label: '해외' },
  { value: 'UNSET', label: '국가 미확인' },
]

export const CATEGORY_LABEL: Record<NetworkCategory, string> = {
  experts: '전문가',
  van: 'BAN',
  exp: 'EXP',
  investors: '투자사',
  corporates: '기업',
  institutions: '기관',
  universities: '대학',
  etc: '기타',
  vendors: '외주/거래',
}

/**
 * 등록·필터에 노출되는 구분(순서 = 화면 노출 순서).
 * 외주/거래(`vendors`)는 은퇴했으므로 여기에 없다 — 기존 행은 목록에 계속 담기지만
 * 새로 만들 수는 없다(카탈로그를 끄는 것과 문을 닫는 것은 다른 축이다).
 */
export const CATEGORY_ORDER: NetworkCategory[] = [
  'van',
  'exp',
  'experts',
  'investors',
  'corporates',
  'institutions',
  'universities',
  'etc',
]

/** 은퇴 구분 — 값으로는 살아 있고 선택지로만 서지 않는다. */
export const RETIRED_CATEGORIES: NetworkCategory[] = ['vendors']

/** "구분" 드롭다운 옵션(등록 폼·미분류 인라인 지정·필터 공용). */
export const CATEGORY_OPTIONS: { key: NetworkCategory; label: string }[] = CATEGORY_ORDER.map(
  (key) => ({ key, label: CATEGORY_LABEL[key] }),
)

/** 구분 코드의 표시 라벨. 미분류(null)와 알 수 없는 값은 빈 문자열로 둔다. */
export function categoryLabel(value: string | null | undefined): string {
  if (!value) return ''
  return CATEGORY_LABEL[value as NetworkCategory] ?? value
}

/**
 * 축약(compact) 유형 — 조직형이라 매칭 가능여부·전문영역·만족도를 폼·상세에서 숨긴다.
 * 미분류(null)도 분류 전 임시 상태이므로 같은 축약 형태를 쓴다.
 */
const COMPACT_CATEGORIES = new Set<string>([
  'corporates',
  'institutions',
  'universities',
  'vendors',
  'etc',
])

export function isCompactCategory(category: string | null | undefined): boolean {
  return category == null || COMPACT_CATEGORIES.has(category)
}

/** 목록 컬럼 — 통합 원장은 표가 하나이므로 구성도 하나다. */
export const NETWORK_LIST_COLUMNS: MasterColumn[] = NETWORK_PROFILE_COLUMNS

/** 조직형만 담기는 목록이 필요할 때(대시보드 미리보기 등) 쓰는 축약 구성. */
export const NETWORK_ORG_LIST_COLUMNS: MasterColumn[] = NETWORK_ORG_COLUMNS

/** 미분류 목록 컬럼(구분을 인라인 드롭다운으로 지정한다). */
export const NETWORK_UNCLASSIFIED_LIST_COLUMNS: MasterColumn[] = NETWORK_UNCLASSIFIED_COLUMNS

export interface NetworkField {
  name: string
  label: string
  required?: boolean
  /** 개인정보 목록 마스킹 유형(목록 셀에만 적용, 상세/폼은 원본). */
  mask?: MaskKind
  /** 지정 시 폼에서 자유 입력 대신 해당 태그 원장(*_tags)의 태그를 선택한다. */
  tagTable?: string
}

/**
 * 통합 원장의 인물 중심 공용 필드. 소속 조직이 아니라 담당자(사람)를 원장으로 관리한다.
 * 이름·소속·이메일·연락처·링크드인은 스칼라 컬럼, 부서/직책은 `profile`(jsonb)에 저장한다.
 * 구분·국가는 폼이 전용 컨트롤로 다루므로 이 목록에 넣지 않는다.
 */
export const NETWORK_FIELDS: NetworkField[] = [
  { name: 'name', label: '이름', required: true, mask: 'name' },
  { name: 'affiliation', label: '소속' },
  { name: 'profile.department', label: '부서명' },
  { name: 'profile.position', label: '직책/직급' },
  { name: 'email', label: '이메일', mask: 'email' },
  { name: 'phone', label: '연락처', mask: 'phone' },
  { name: 'linkedin_url', label: '링크드인' },
]

/**
 * 자유 입력 "구분" 문자열(업로드 CSV·레거시 값)을 코드로 해석한다.
 * 라벨과 코드를 모두 받아들이고, 알 수 없으면 `null`(미분류)로 흡수한다.
 */
export function resolveCategory(value: string | null | undefined): NetworkCategory | null {
  const trimmed = (value ?? '').trim()
  if (!trimmed) return null
  if (trimmed.toUpperCase() === 'VAN') return 'van'
  const byCode = (Object.keys(CATEGORY_LABEL) as NetworkCategory[]).find((k) => k === trimmed)
  if (byCode) return byCode
  const byLabel = (Object.keys(CATEGORY_LABEL) as NetworkCategory[]).find(
    (k) => CATEGORY_LABEL[k] === trimmed,
  )
  return byLabel ?? null
}

/**
 * 소속/이메일 도메인으로 추천 구분을 추정한다(미분류 일괄 분류 보조).
 * 확신이 낮으면 null(미분류 유지). 대학 › 투자사 › 기관 › 기업 순으로 판정한다.
 */
export function suggestCategory(
  affiliation: string | null | undefined,
  email?: string | null,
): NetworkCategory | null {
  const domain = (email ?? '').split('@')[1] ?? ''
  const hay = `${affiliation ?? ''} ${domain}`.toLowerCase().trim()
  if (!hay) return null
  const has = (words: string[]) => words.some((w) => hay.includes(w))
  if (has(['대학', 'univ', 'college', '.edu', '연구소', '연구원'])) return 'universities'
  if (has(['벤처', '인베스트', '캐피탈', '자산운용', '파트너스', 'ventures', 'capital', 'partners', 'invest']))
    return 'investors'
  if (has(['진흥원', '재단', '센터', '협회', '공사', '공단', '진흥', 'foundation', 'agency', 'institute', 'go.kr', 'or.kr']))
    return 'institutions'
  if (has(['㈜', '주식회사', '(주)', 'inc', 'corp', 'ltd', 'co.,', 'company'])) return 'corporates'
  return null
}

/**
 * 민감정보 접근 로그(access_logs)용 리소스 타입.
 * 원장이 하나가 되었으므로 값도 하나다(감사 로그의 기존 행은 옛 값을 그대로 보존한다 —
 * 그때 무엇에 접근했는지의 기록이라 사후에 이름을 바꾸면 사실이 아닌 기록이 된다).
 */
export const NETWORK_RESOURCE_TYPE = 'network'

/**
 * 자료·피드백·회의록 링크가 이 원장을 가리킬 때 쓰는 다형 키(단수형).
 * 종전 10종(expert·van·investor…)이 2026-09-04 통합으로 이 한 값이 되었다.
 */
export const NETWORK_TARGET_TYPE = 'network'
