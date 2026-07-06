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
  categories: {
    tab: 'categories',
    table: 'category_tags',
    heading: '구분태그 관리',
    noun: '구분',
  },
} satisfies Record<string, TagConfig>
