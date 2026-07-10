import type { MaskKind, MasterColumn } from '@/features/master/types'
import {
  NETWORK_ORG_COLUMNS,
  NETWORK_OTHERS_COLUMNS,
  NETWORK_PROFILE_COLUMNS,
} from '@/features/master/networkProfileColumns'

/**
 * NETWORKS 마스터 엔티티 키.
 * - 화면 노출 8종은 `ENTITY_ORDER`가 원천이며, `partners`는 HUB 조회 하위호환용으로만 유지한다.
 */
export type EntityKey =
  | 'startups'
  | 'experts'
  | 'van'
  | 'exp'
  | 'investors'
  | 'corporates'
  | 'institutions'
  | 'universities'
  | 'vendors'
  | 'etc'
  | 'others'
  | 'partners'

export interface EntityField {
  name: string
  label: string
  required?: boolean
  /** 개인정보 목록 마스킹 유형(목록 셀에만 적용, 상세/폼은 원본). */
  mask?: MaskKind
  /**
   * 지정 시 폼에서 자유 입력 대신 해당 태그 원장(*_tags)의 태그를 선택한다(ADMIN 태그 관리 연동).
   * 예: 'investment_stage_tags'. 목록에 없는 레거시 값은 현재값으로 보존 노출된다.
   */
  tagTable?: string
}

/**
 * 네트워크 8종 공용 인물 중심 필드(업로드 양식 통일).
 * 소속 조직이 아니라 담당자(사람)를 원장으로 관리한다. 부서/직책/구분은 `profile`(jsonb)에,
 * 이름·소속·이메일·연락처는 스칼라 컬럼에 저장한다(experts와 동일 스키마).
 */
const PERSON_FIELDS: EntityField[] = [
  { name: 'name', label: '이름', required: true },
  { name: 'affiliation', label: '소속' },
  { name: 'profile.department', label: '부서명' },
  { name: 'profile.position', label: '직책/직급' },
  { name: 'email', label: '이메일', mask: 'email' },
  { name: 'phone', label: '연락처', mask: 'phone' },
  { name: 'profile.category', label: '구분' },
]

export interface EntityConfig {
  key: EntityKey
  label: string
  table: EntityKey
  /** 폼/상세 대상 스칼라 필드(JSONB 부속 필드는 상세에서 별도 처리). */
  fields: EntityField[]
  /**
   * 목록 표시 컬럼 재정의. 미지정 시 `fields`를 그대로 목록 컬럼으로 사용한다.
   * 전문가·VAN·투자자는 공용 프로필 컬럼(구분/분야/활동/매칭/만족도)을 목록에 노출하되
   * 등록·상세 폼은 `fields`를 유지한다.
   */
  listColumns?: MasterColumn[]
}

/** NETWORKS 마스터 엔티티 정의(등록 폼·목록 컬럼 공통 원천). */
export const ENTITIES: Record<EntityKey, EntityConfig> = {
  startups: {
    key: 'startups',
    label: '스타트업',
    table: 'startups',
    fields: [
      { name: 'name', label: '기업명', required: true },
      { name: 'biz_reg_no', label: '사업자등록번호' },
      { name: 'representative', label: '대표자' },
      // 산업/단계/구분/현황은 ADMIN 태그 관리 원장에서 선택한다(자유 입력 아님).
      { name: 'industry', label: '산업', tagTable: 'industry_tags' },
      { name: 'stage', label: '단계', tagTable: 'investment_stage_tags' },
      { name: 'management_status', label: '구분', tagTable: 'company_category_tags' },
      { name: 'pool_status', label: '현황', tagTable: 'company_status_tags' },
    ],
  },
  experts: {
    key: 'experts',
    label: '전문가',
    table: 'experts',
    fields: PERSON_FIELDS,
    listColumns: NETWORK_PROFILE_COLUMNS,
  },
  van: {
    key: 'van',
    label: 'BAN',
    table: 'van',
    fields: PERSON_FIELDS,
    listColumns: NETWORK_PROFILE_COLUMNS,
  },
  exp: {
    key: 'exp',
    label: 'EXP',
    table: 'exp',
    // 전문가(experts)와 동일한 프로필형 구조: 공용 프로필 컬럼·통합 폼·상세페이지를 공유한다.
    fields: PERSON_FIELDS,
    listColumns: NETWORK_PROFILE_COLUMNS,
  },
  investors: {
    key: 'investors',
    label: '투자사',
    table: 'investors',
    fields: PERSON_FIELDS,
    listColumns: NETWORK_PROFILE_COLUMNS,
  },
  corporates: {
    key: 'corporates',
    label: '기업',
    table: 'corporates',
    fields: PERSON_FIELDS,
    // 조직 유형: 분야·활동·만족도·매칭을 제외한 축약 컬럼(폼·상세 숨김과 대칭).
    listColumns: NETWORK_ORG_COLUMNS,
  },
  institutions: {
    key: 'institutions',
    label: '기관',
    table: 'institutions',
    fields: PERSON_FIELDS,
    listColumns: NETWORK_ORG_COLUMNS,
  },
  universities: {
    key: 'universities',
    label: '대학',
    table: 'universities',
    fields: PERSON_FIELDS,
    listColumns: NETWORK_ORG_COLUMNS,
  },
  vendors: {
    key: 'vendors',
    label: '외주/거래',
    table: 'vendors',
    fields: PERSON_FIELDS,
    listColumns: NETWORK_ORG_COLUMNS,
  },
  etc: {
    key: 'etc',
    label: '기타',
    table: 'etc',
    fields: PERSON_FIELDS,
    // 기타는 조직형(compact) 네트워크 — 조직 4종과 동일 컬럼(분야/활동/만족도/매칭 제외, 부서 노출).
    listColumns: NETWORK_ORG_COLUMNS,
  },
  others: {
    key: 'others',
    label: '미분류',
    table: 'others',
    fields: PERSON_FIELDS,
    // 미분류 데이터베이스(임시 저장소): 목록에서 구분을 드롭다운으로 골라 대상 네트워크로 이관한다.
    listColumns: NETWORK_OTHERS_COLUMNS,
  },
  // 협력사: NETWORKS 화면에서는 은퇴(→ van 이관)했으나 HUB 조회 하위호환을 위해 정의만 유지한다.
  partners: {
    key: 'partners',
    label: '협력사',
    table: 'partners',
    fields: [
      { name: 'name', label: '협력사명', required: true },
      { name: 'partner_type', label: '유형' },
      { name: 'memo', label: '메모' },
    ],
  },
}

/**
 * '마스터 네트워크 관리'에 노출되는 분류 가능한 네트워크 카테고리(구분 옵션의 원천).
 * 스타트업은 STARTUP 워크스페이스로 분리, partners는 제외.
 * 미분류(others)는 카테고리가 아니라 임시 저장소(미분류 데이터베이스)이므로 여기서 제외한다.
 */
export const ENTITY_ORDER: EntityKey[] = [
  'van',
  'exp',
  'experts',
  'investors',
  'corporates',
  'institutions',
  'universities',
  'vendors',
  'etc',
]

/**
 * 디렉토리(목록+상세)로 렌더되는 전체 엔티티.
 * 분류 카테고리(ENTITY_ORDER) + 미분류 데이터베이스(others 임시 저장소).
 * NetworksPage 탭 인식·상세 라우트·상세페이지 사용 판정의 단일 원천이다.
 */
export const DIRECTORY_ENTITIES: EntityKey[] = [...ENTITY_ORDER, 'others']

/**
 * 전문가 프로필 구조(사진·약력·분야·구분·매칭·소개)를 공유하는 엔티티.
 * 업로드 양식 통일(Phase 15)로 8종 전부 experts와 동일한 컬럼
 * (email/phone/affiliation/expertise/profile)을 가지며, 공용 통합 폼(`NetworkForm`)과
 * 공용 상세페이지(`NetworkDetailPage`)를 동일 컴포넌트로 사용한다.
 */
export const PROFILE_ENTITIES: EntityKey[] = [...DIRECTORY_ENTITIES]

/** 해당 엔티티가 공용 프로필 상세페이지(모달 아님)를 사용하는지 여부. */
export function isProfileEntity(key: EntityKey): boolean {
  return PROFILE_ENTITIES.includes(key)
}

/**
 * HUB 조회 센터에서 읽기 전용 상세 라우트(`/hub/:entity/:id`)를 갖는 엔티티.
 * HUB는 마스터를 소유하지 않으므로 전문가·VAN·투자사 프로필 3종만 상세로 진입하고,
 * 그 외는 조회 모달로 표시한다.
 */
export const HUB_DETAIL_ENTITIES: EntityKey[] = ['experts', 'van', 'investors']

/** HUB 조회 센터에서 읽기 전용 상세 라우트를 갖는 엔티티인지 여부. */
export function isHubDetailEntity(key: EntityKey): boolean {
  return HUB_DETAIL_ENTITIES.includes(key)
}

/**
 * 축약(compact) 유형 — "구분"이 이들 중 하나이면 통합 폼·상세에서 매칭 가능여부·전문분야·약력·
 * 멘토링 만족도를 숨긴다. 조직 유형(기업·기관·대학·외주/거래·기타)에 더해, 미분류(others)도
 * 분류 전 임시 저장소이므로 기업 네트워크처럼 간단한 항목만 노출한다.
 */
export const COMPACT_ENTITIES: EntityKey[] = [
  'corporates',
  'institutions',
  'universities',
  'vendors',
  'etc',
  'others',
]

/** 통합 폼에서 매칭/전문분야/약력을 숨기는 축약(조직) 유형인지 여부. */
export function isCompactEntity(key: EntityKey): boolean {
  return COMPACT_ENTITIES.includes(key)
}

/** 모달이 아닌 상세페이지에서 등록/수정하는 엔티티(카테고리 + 미분류 데이터베이스). */
export function usesDetailPage(key: EntityKey): boolean {
  return DIRECTORY_ENTITIES.includes(key)
}

/**
 * "구분" 드롭다운 옵션(라벨 → 엔티티 키). 통합 폼·CSV 임포터가 공유한다.
 * 선택한 라벨이 저장 대상 테이블을 결정한다. 미분류(others)도 포함해 통합 폼에서 레코드를
 * 미분류 데이터베이스로 되돌리거나 미분류 레코드를 올바르게 표시할 수 있게 한다.
 * (미분류 목록의 인라인 이관 드롭다운은 DirectoryTab에서 others를 걸러 실제 카테고리만 노출한다.)
 */
export const CATEGORY_OPTIONS: { key: EntityKey; label: string }[] = DIRECTORY_ENTITIES.map(
  (key) => ({ key, label: ENTITIES[key].label }),
)

const CATEGORY_ALIASES: Record<string, EntityKey> = {
  VAN: 'van',
}

export function displayCategoryLabel(value: unknown): unknown {
  return value === 'VAN' ? ENTITIES.van.label : value
}

export function normalizeEntityRowCategory<T extends Record<string, unknown>>(row: T, table: EntityKey): T {
  if (table !== 'van' || row.profile == null || typeof row.profile !== 'object') return row
  const profile = row.profile as Record<string, unknown>
  if (profile.category !== 'VAN') return row
  return { ...row, profile: { ...profile, category: displayCategoryLabel(profile.category) } }
}

/**
 * "구분" 값(라벨)으로 저장 대상 엔티티 키를 해석한다.
 * ENTITY_ORDER 라벨과 매칭되지 않는 값(게스트·스타트업 등)은 미분류(others)로 흡수한다.
 */
export function resolveEntityFromCategory(value: string | null | undefined): EntityKey {
  const trimmed = (value ?? '').trim()
  const alias = CATEGORY_ALIASES[trimmed]
  if (alias) return alias
  const found = CATEGORY_OPTIONS.find((o) => o.label === trimmed)
  return found?.key ?? 'others'
}

/**
 * 소속/이메일 도메인으로 추천 구분(엔티티 키)을 추정한다(미분류 일괄 분류 보조).
 * 확신이 낮으면 null(미분류 유지). 대학 › 투자사 › 기관 › 기업 순으로 판정한다.
 */
export function suggestCategory(
  affiliation: string | null | undefined,
  email?: string | null,
): EntityKey | null {
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

/** 민감정보 접근 로그(access_logs)용 리소스 타입(8종 전체). */
export const PROFILE_RESOURCE_TYPE: Partial<Record<EntityKey, string>> = {
  experts: 'expert',
  van: 'van',
  exp: 'exp',
  investors: 'investor',
  corporates: 'corporate',
  institutions: 'institution',
  universities: 'university',
  vendors: 'vendor',
  etc: 'etc',
  others: 'other',
}
