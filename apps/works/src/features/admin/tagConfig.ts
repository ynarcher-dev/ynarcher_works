/** 2뎁스 태그의 부모 참조 설정(예: 국가 → 권역). */
export interface TagParentConfig {
  /** 부모 태그 테이블명(예: region_tags) */
  table: string
  /** 자식 레코드가 부모를 참조하는 FK 컬럼(예: region_tag_id) */
  column: string
  /** 부모 분류 명사(예: '권역') */
  noun: string
}

/** ADMIN 기준정보 태그 관리 설정. 산업/분야 등 동일 구조 태그 테이블을 하나의 패널로 처리한다. */
export interface TagConfig {
  /** ADMIN ?tab 키 */
  tab: string
  /** Supabase 테이블명 */
  table: string
  /** 메뉴·페이지 제목 */
  heading: string
  /** UI 문구에 쓰는 분류 명사(예: '산업 분야', '분야') */
  noun: string
  /** 2뎁스 태그일 때 부모 설정(예: 국가 태그의 부모 권역). 미지정 시 평면 태그. */
  parent?: TagParentConfig
}

export const TAG_CONFIGS = {
  industries: {
    tab: 'industries',
    table: 'industry_tags',
    heading: '산업태그 관리',
    noun: '산업 분야',
  },
  fields: {
    tab: 'fields',
    table: 'field_tags',
    heading: '분야태그 관리',
    noun: '분야',
  },
  positions: {
    tab: 'positions',
    table: 'position_tags',
    heading: '직책태그 관리',
    noun: '직책',
  },
  ranks: {
    tab: 'ranks',
    table: 'rank_tags',
    heading: '직급태그 관리',
    noun: '직급',
  },
  paySteps: {
    tab: 'pay_steps',
    table: 'pay_step_tags',
    heading: '호봉태그 관리',
    noun: '호봉',
  },
  categories: {
    tab: 'categories',
    table: 'category_tags',
    heading: '구분태그 관리',
    noun: '구분',
  },
  regions: {
    tab: 'regions',
    table: 'region_tags',
    heading: '권역태그 관리',
    noun: '권역',
  },
  countries: {
    tab: 'countries',
    table: 'country_tags',
    heading: '국가태그 관리',
    noun: '국가',
    // 2뎁스: 권역(region_tags)을 부모로 참조한다. 등록 시 권역을 먼저 고르고 국가를 넣는다.
    parent: { table: 'region_tags', column: 'region_tag_id', noun: '권역' },
  },
} satisfies Record<string, TagConfig>
