import type { MasterColumn } from '@/features/master/types'

/** 글로벌 네트워크 마스터 테이블명(국내 8종과 분리된 독립 단일 마스터). */
export const GLOBAL_TABLE = 'global_networks'

/** 권역/국가 기준정보 태그 테이블(글로벌 전용, ADMIN 관리). */
export const REGION_TAG_TABLE = 'region_tags'
export const COUNTRY_TAG_TABLE = 'country_tags'

/**
 * 글로벌 네트워크 '구분' 고정 3값. 국내처럼 테이블을 나누지 않고 스칼라 속성으로 둔다.
 * DB의 category CHECK 제약(기업/기관/투자자)과 반드시 동일하게 유지한다.
 */
export const GLOBAL_CATEGORY_OPTIONS = ['기업', '기관', '투자자'] as const
export type GlobalCategory = (typeof GLOBAL_CATEGORY_OPTIONS)[number]

/** 글로벌 네트워크 목록 행(조인된 권역·국가명 포함). */
export type GlobalRow = Record<string, unknown> & {
  id: string
  name: string
  email?: string | null
  phone?: string | null
  affiliation?: string | null
  linkedin_url?: string | null
  category?: string | null
  region_tag_id?: string | null
  country_tag_id?: string | null
  expertise?: unknown[] | null
  profile?: Record<string, unknown> | null
  /** 조인 임베드: 권역/국가명(목록 표시용). */
  region?: { name: string } | null
  country?: { name: string } | null
  is_provisional?: boolean
  merged_into_id?: string | null
}

/**
 * 글로벌 네트워크 목록 컬럼(공용 MasterListView 재활용).
 * DataTable 내장 컬럼(좌측 `No.`, 우측 `작성자`/`수정일`/`관리`)은 자동 렌더되므로
 * 여기서는 도메인 컬럼만 정의한다. 권역/국가는 태그 FK를 조인해 이름을 태그로 표시하고,
 * 링크드인은 URL 유무에 따라 아이콘 색으로 표시한다(kind: 'link').
 */
export const GLOBAL_COLUMNS: MasterColumn[] = [
  { name: 'name', label: '이름', className: 'w-24' },
  { name: 'affiliation', label: '소속', className: 'w-40' },
  { name: 'profile.position', label: '직책/직급', className: 'w-24' },
  { name: 'email', label: '이메일', mask: 'email', className: 'w-44' },
  { name: 'phone', label: '연락처', mask: 'phone', className: 'w-32' },
  { name: 'linkedin_url', label: '링크드인', kind: 'link', align: 'center', className: 'w-20' },
  { name: 'region.name', label: '권역', kind: 'tag', className: 'w-24' },
  { name: 'country.name', label: '국가', kind: 'tag', className: 'w-40' },
  { name: 'category', label: '구분', kind: 'tag', className: 'w-20' },
]
