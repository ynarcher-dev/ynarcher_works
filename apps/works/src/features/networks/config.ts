import type { MaskKind, MasterColumn } from '@/features/master/types'
import { NETWORK_PROFILE_COLUMNS } from '@/features/master/networkProfileColumns'
import { NETWORK_ORG_COLUMNS } from '@/features/master/networkOrgColumns'

/**
 * NETWORKS 마스터 엔티티 키.
 * - 화면 노출 8종은 `ENTITY_ORDER`가 원천이며, `partners`는 HUB 조회 하위호환용으로만 유지한다.
 */
export type EntityKey =
  | 'startups'
  | 'experts'
  | 'van'
  | 'investors'
  | 'corporates'
  | 'institutions'
  | 'universities'
  | 'vendors'
  | 'others'
  | 'partners'

export interface EntityField {
  name: string
  label: string
  required?: boolean
  /** 개인정보 목록 마스킹 유형(목록 셀에만 적용, 상세/폼은 원본). */
  mask?: MaskKind
}

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
      { name: 'industry', label: '산업' },
      { name: 'stage', label: '성장 단계' },
    ],
  },
  experts: {
    key: 'experts',
    label: '전문가',
    table: 'experts',
    fields: [
      { name: 'name', label: '이름', required: true },
      { name: 'email', label: '이메일', mask: 'email' },
      { name: 'phone', label: '연락처', mask: 'phone' },
      { name: 'affiliation', label: '소속' },
    ],
    listColumns: NETWORK_PROFILE_COLUMNS,
  },
  van: {
    key: 'van',
    label: 'VAN',
    table: 'van',
    fields: [
      { name: 'name', label: '기관명', required: true },
      { name: 'category', label: '구분' },
      { name: 'representative', label: '담당자' },
      { name: 'memo', label: '메모' },
    ],
    listColumns: NETWORK_PROFILE_COLUMNS,
  },
  investors: {
    key: 'investors',
    label: '투자사',
    table: 'investors',
    fields: [
      { name: 'name', label: '투자사명', required: true },
      { name: 'investor_type', label: '유형' },
      { name: 'representative', label: '대표자' },
      { name: 'focus', label: '투자 분야' },
    ],
    listColumns: NETWORK_PROFILE_COLUMNS,
  },
  corporates: {
    key: 'corporates',
    label: '기업',
    table: 'corporates',
    fields: [
      { name: 'name', label: '기업명', required: true },
      { name: 'biz_reg_no', label: '사업자등록번호' },
      { name: 'representative', label: '대표자' },
      { name: 'industry', label: '산업' },
    ],
    listColumns: NETWORK_ORG_COLUMNS,
  },
  institutions: {
    key: 'institutions',
    label: '기관',
    table: 'institutions',
    fields: [
      { name: 'name', label: '기관명', required: true },
      { name: 'institution_type', label: '유형' },
      { name: 'representative', label: '대표' },
      { name: 'region', label: '지역' },
    ],
    listColumns: NETWORK_ORG_COLUMNS,
  },
  universities: {
    key: 'universities',
    label: '대학',
    table: 'universities',
    fields: [
      { name: 'name', label: '대학명', required: true },
      { name: 'university_type', label: '구분' },
      { name: 'department', label: '학과/부서' },
      { name: 'region', label: '지역' },
    ],
    listColumns: NETWORK_ORG_COLUMNS,
  },
  vendors: {
    key: 'vendors',
    label: '외주/거래',
    table: 'vendors',
    fields: [
      { name: 'name', label: '거래처명', required: true },
      { name: 'category', label: '구분' },
      { name: 'representative', label: '담당자' },
      { name: 'memo', label: '메모' },
    ],
    listColumns: NETWORK_ORG_COLUMNS,
  },
  others: {
    key: 'others',
    label: '미분류',
    table: 'others',
    fields: [
      { name: 'name', label: '명칭', required: true },
      { name: 'category', label: '구분' },
      { name: 'representative', label: '담당자' },
      { name: 'memo', label: '메모' },
    ],
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

/** NETWORKS 화면 노출 순서. 스타트업은 STARTUP 워크스페이스로 분리, partners는 제외. */
export const ENTITY_ORDER: EntityKey[] = [
  'experts',
  'van',
  'investors',
  'corporates',
  'institutions',
  'universities',
  'vendors',
  'others',
]

/**
 * 전문가 프로필 구조(사진·약력·분야·구분·매칭·소개)를 공유하는 엔티티.
 * 공용 프로필 목록(`NETWORK_PROFILE_COLUMNS`) + 공용 상세페이지/등록폼(`ProfileDetailPage`·`ProfileForm`)을
 * 동일 컴포넌트로 사용한다. DB도 experts와 동일한 컬럼(email/phone/affiliation/expertise/profile)을 갖는다.
 */
export const PROFILE_ENTITIES: EntityKey[] = ['experts', 'van', 'investors']

/** 해당 엔티티가 공용 프로필 상세페이지(모달 아님)를 사용하는지 여부. */
export function isProfileEntity(key: EntityKey): boolean {
  return PROFILE_ENTITIES.includes(key)
}

/** 민감정보 접근 로그(access_logs)용 리소스 타입. */
export const PROFILE_RESOURCE_TYPE: Partial<Record<EntityKey, string>> = {
  experts: 'expert',
  van: 'van',
  investors: 'investor',
}
