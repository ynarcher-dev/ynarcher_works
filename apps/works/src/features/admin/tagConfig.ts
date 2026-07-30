/** 2뎁스 태그의 부모 참조 설정(예: 국가 → 권역). */
export interface TagParentConfig {
  /** 부모 태그 테이블명(예: region_tags) */
  table: string
  /** 자식 레코드가 부모를 참조하는 FK 컬럼(예: region_tag_id) */
  column: string
  /** 부모 분류 명사(예: '권역') */
  noun: string
}

/**
 * 표기 방식(display_mode) 선택지 한 줄. 이 설정을 가진 태그 원장만 관리 화면에 '표기 방식'
 * 열이 생기고, 조회도 그때만 컬럼을 함께 읽는다(컬럼이 없는 원장에 켜면 조회가 깨진다).
 */
export interface TagModeOption {
  /** DB에 저장하는 값(rank_tags/position_tags.display_mode의 check 제약과 같아야 한다). */
  value: 'DEFAULT' | 'PRIORITY' | 'PARALLEL_JOINED' | 'PARALLEL_SEPARATE'
  /** 셀렉트에 보이는 말. 고른 결과가 어떻게 찍히는지까지 라벨에 적는다. */
  label: string
}

/** 기준정보 태그 관리 설정. 산업/분야 등 동일 구조 태그 테이블을 하나의 패널로 처리한다. */
export interface TagConfig {
  /** 소유 워크스페이스의 ?tab 키 */
  tab: string
  /** Supabase 테이블명 */
  table: string
  /** 메뉴·페이지 제목 */
  heading: string
  /** 사이드바 '태그 관리' 그룹 안에서 쓰는 짧은 표기(그룹명이 '태그'를 이미 말하므로 접미어를 뺀다) */
  menuLabel: string
  /**
   * 이 태그 원장을 메뉴로 노출하는 워크스페이스.
   * `admin`은 ADMIN '태그 관리' 그룹에, `management`는 MANAGEMENT 인사 기준정보 메뉴에 실린다.
   * 사이드바(config/navigation.ts)와 각 페이지의 라우팅이 이 값 하나로 갈리므로,
   * 태그를 추가할 때는 여기에 항목만 더하면 메뉴·헤딩·패널이 함께 따라온다.
   */
  owner: 'admin' | 'management'
  /** UI 문구에 쓰는 분류 명사(예: '산업 분야', '분야') */
  noun: string
  /** 2뎁스 태그일 때 부모 설정(예: 국가 태그의 부모 권역). 미지정 시 평면 태그. */
  parent?: TagParentConfig
  /**
   * 표기 방식 선택지(직급·직책 태그 전용). 있으면 관리 표에 '표기 방식' 열이 생긴다.
   * 이 값이 임직원 이름 옆 호칭을 정한다 — 합치는 순서는 `features/management/jobTitle.ts` 참조.
   */
  modes?: TagModeOption[]
}

export const TAG_CONFIGS = {
  industries: {
    tab: 'industries',
    table: 'industry_tags',
    heading: '산업태그 관리',
    menuLabel: '산업',
    owner: 'admin',
    noun: '산업 분야',
  },
  fields: {
    tab: 'fields',
    table: 'field_tags',
    heading: '분야태그 관리',
    menuLabel: '분야',
    owner: 'admin',
    noun: '분야',
  },
  positions: {
    tab: 'positions',
    table: 'position_tags',
    heading: '직책태그 관리',
    menuLabel: '직책',
    owner: 'management',
    noun: '직책',
    // 실장·팀장처럼 자리 자체가 위계인 직책은 기본(직책만), 심사역·매니저처럼 역할을 가리키는
    // 이름은 병렬 표기로 둔다 — 직급이 앞에 붙어야 위계가 드러난다.
    modes: [
      { value: 'DEFAULT', label: '기본 (직책만)' },
      { value: 'PRIORITY', label: '직책 우선 (직급을 눌러 직책만)' },
      { value: 'PARALLEL_JOINED', label: '병렬 표기 · 붙여쓰기 (책임매니저)' },
      { value: 'PARALLEL_SEPARATE', label: '병렬 표기 · 따로쓰기 (책임/매니저)' },
    ],
  },
  ranks: {
    tab: 'ranks',
    table: 'rank_tags',
    heading: '직급태그 관리',
    menuLabel: '직급',
    owner: 'management',
    noun: '직급',
    // 직급 쪽 설정이 직책 쪽을 이긴다 — 둘 다 '우선'이면 직급만 남는다.
    modes: [
      { value: 'DEFAULT', label: '기본 (직책 설정을 따름)' },
      { value: 'PRIORITY', label: '직급 우선 (직책이 있어도 직급만)' },
      { value: 'PARALLEL_JOINED', label: '병렬 표기 · 붙여쓰기 (이사본부장)' },
      { value: 'PARALLEL_SEPARATE', label: '병렬 표기 · 따로쓰기 (이사/본부장)' },
    ],
  },
  paySteps: {
    tab: 'pay_steps',
    table: 'pay_step_tags',
    heading: '호봉태그 관리',
    menuLabel: '호봉',
    owner: 'management',
    noun: '호봉',
  },
  categories: {
    tab: 'categories',
    table: 'category_tags',
    heading: '구분태그 관리',
    menuLabel: '구분',
    owner: 'admin',
    noun: '구분',
  },
  regions: {
    tab: 'regions',
    table: 'region_tags',
    heading: '권역태그 관리',
    menuLabel: '권역',
    owner: 'admin',
    noun: '권역',
  },
  countries: {
    tab: 'countries',
    table: 'country_tags',
    heading: '국가태그 관리',
    menuLabel: '국가',
    owner: 'admin',
    noun: '국가',
    // 2뎁스: 권역(region_tags)을 부모로 참조한다. 등록 시 권역을 먼저 고르고 국가를 넣는다.
    parent: { table: 'region_tags', column: 'region_tag_id', noun: '권역' },
  },
  // 스타트업 풀 기준정보 — 단계/구분/현황 컬럼 선택지 원장.
  investmentStages: {
    tab: 'investment_stages',
    table: 'investment_stage_tags',
    heading: '투자단계태그 관리',
    menuLabel: '투자단계',
    owner: 'admin',
    noun: '투자단계',
  },
  companyCategories: {
    tab: 'company_categories',
    table: 'company_category_tags',
    heading: '기업구분태그 관리',
    menuLabel: '기업구분',
    owner: 'admin',
    noun: '기업구분',
  },
  companyStatuses: {
    tab: 'company_statuses',
    table: 'company_status_tags',
    heading: '기업현황태그 관리',
    menuLabel: '기업현황',
    owner: 'admin',
    noun: '기업현황',
  },
  locations: {
    tab: 'locations',
    table: 'location_tags',
    heading: '소재지태그 관리',
    menuLabel: '소재지',
    owner: 'admin',
    noun: '소재지',
  },
  // FUND 포트폴리오 투자방식(investments.investment_method) 선택지 원장.
  investmentMethods: {
    tab: 'investment_methods',
    table: 'investment_method_tags',
    heading: '투자방식태그 관리',
    menuLabel: '투자방식',
    owner: 'admin',
    noun: '투자방식',
  },
} satisfies Record<string, TagConfig>

/** 소유 워크스페이스별 태그 설정 목록. 선언 순서가 곧 사이드바 노출 순서다. */
function tagsOf(owner: TagConfig['owner']): TagConfig[] {
  return Object.values(TAG_CONFIGS).filter((c) => c.owner === owner)
}

/** ADMIN '태그 관리' 그룹에 실리는 전사 기준정보 태그. */
export const ADMIN_TAG_CONFIGS: TagConfig[] = tagsOf('admin')

/** MANAGEMENT 인사 기준정보 태그(직책·직급·호봉). */
export const MANAGEMENT_TAG_CONFIGS: TagConfig[] = tagsOf('management')

/** `?tab` → 태그 설정. 워크스페이스를 넘겨 다른 워크스페이스의 태그 탭이 새지 않게 한다. */
export function tagConfigOf(owner: TagConfig['owner'], tab: string): TagConfig | undefined {
  return tagsOf(owner).find((c) => c.tab === tab)
}
