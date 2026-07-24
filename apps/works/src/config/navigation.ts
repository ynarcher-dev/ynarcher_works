import type { WorkspaceKey } from '@/auth/types'
import {
  AC_CATEGORIES,
  MNA_CATEGORIES,
  PROJECT_CATEGORIES,
  categoryTab,
  type ProgramCategoryOption,
} from '@/config/programCategories'

/** 사이드바 세부 메뉴 항목. tab은 페이지 내부 섹션을 제어하는 `?tab=` 쿼리 값. */
export interface SubNavItem {
  label: string
  /** 미지정 시 워크스페이스 루트(단일 대시보드 메뉴)를 의미한다. */
  tab?: string
  /** 하위 항목(아코디언). 지정 시 이 항목은 펼침/접힘 그룹 헤더가 된다. */
  children?: SubNavItem[]
  /**
   * 하위 항목을 런타임 게시판 레지스트리에서 주입(아코디언 없이 상위 단독 항목으로 평탄 나열).
   * 그룹핑 축은 게시 종류(kind) 하나다 — 설계: docs/docs_planning/3_1_1_board_archive_notice.md
   * - 'boards': 게시판(kind = POST)
   * - 'archives': 자료실(kind = ARCHIVE)
   */
  dynamicKey?: 'boards' | 'archives'
  /** 동적 항목의 아이콘 키(boardIcons.ts). 지정 시 tab 기반 매핑보다 우선한다. */
  iconKey?: string
  /** 이 항목 위에 같은 그룹 내 구분선을 그린다(그룹은 유지한 채 항목 사이만 시각적으로 나눌 때). */
  dividerBefore?: boolean
}

/** 사이드바 메뉴 그룹(그룹명 헤더 + 항목들). */
export interface SubNavGroup {
  group?: string
  items: SubNavItem[]
}

/**
 * 사업 워크스페이스(AC/M&A/PROJECT) 공용 사이드바 구성.
 * 현황 → 내 ~ 관리 → 사업구분(카테고리)별 항목 순으로 나열한다.
 * 앞 두 항목 라벨은 워크스페이스마다 다르므로(예: M&A는 `딜 현황`/`내 딜 관리`) 인자로 받는다.
 * 카테고리 항목의 `tab`은 소문자 카테고리 값이며(예: `pe_fund`), ProgramWorkspacePage가
 * 이를 목록의 category 스코프로 해석한다.
 *
 * '전체' 항목은 두지 않는다. 대신 각 워크스페이스의 '기타'가 미분류(category is null) 건을
 * 함께 담아(ProgramCategoryOption.includeUnclassified) 사각지대를 막는다.
 * 다만 `?tab=all`은 상세 뒤로가기 폴백·기존 북마크를 위해 페이지 쪽에서 계속 처리한다.
 */
function programSubnav(
  dashboardLabel: string,
  mineLabel: string,
  categories: readonly ProgramCategoryOption[],
): SubNavGroup[] {
  return [
    {
      items: [
        { label: dashboardLabel, tab: 'dashboard' },
        { label: mineLabel, tab: 'mine', dividerBefore: true },
        ...categories.map((c, i) => ({
          label: c.menuLabel,
          tab: categoryTab(c.value),
          // 카테고리 묶음 시작에만 구분선을 둔다.
          ...(i === 0 ? { dividerBefore: true } : {}),
        })),
      ],
    },
  ]
}

/**
 * 워크스페이스별 좌측 사이드바 세부 메뉴.
 * 근거: 2_app_layout_navigation.md §3.1 (Contextual Sidebar Menu)
 */
export const WORKSPACE_SUBNAV: Partial<Record<WorkspaceKey, SubNavGroup[]>> = {
  startup: [
    {
      items: [
        { label: '기업 현황', tab: 'dashboard' },
        // 구분 무관, 담당자(startup_managers) 또는 등록자가 나인 기업.
        { label: '내 기업 관리', tab: 'mine', dividerBefore: true },
        // 투자/보육/발굴/기타 4분류. 발굴기업이 기존 스타트업 마스터 디렉토리.
        { label: '투자기업', tab: 'invested', dividerBefore: true },
        { label: '보육기업', tab: 'incubated' },
        { label: '발굴기업', tab: 'discovered' },
        { label: '기타기업', tab: 'etc' },
        { label: '아처스캔', tab: 'archerscan', dividerBefore: true },
        { label: '대용량 업로드', tab: 'bulk' },
      ],
    },
  ],
  networks: [
    {
      items: [
        { label: '네트워크 현황', tab: 'dashboard' },
        // 종류 무관, 내가 등록·편집·병합에 관여한(entity_contributions) 네트워크 통합 목록.
        { label: '내 네트워크 관리', tab: 'mine', dividerBefore: true },
      ],
    },
    {
      group: '마스터 네트워크 관리',
      items: [
        { label: '전문가 네트워크', tab: 'experts' },
        { label: '투자사 네트워크', tab: 'investors' },
        { label: 'BAN 네트워크', tab: 'van' },
        { label: 'EXP 네트워크', tab: 'exp' },
        { label: '기업 네트워크', tab: 'corporates', dividerBefore: true },
        { label: '기관 네트워크', tab: 'institutions' },
        { label: '대학 네트워크', tab: 'universities' },
        { label: '기타 네트워크', tab: 'etc' },
      ],
    },
    {
      group: '데이터 관리',
      items: [
        // 글로벌 네트워크: 미분류 데이터베이스 위에 구분선으로 구획(기능은 보류, 메뉴만 제공).
        { label: '글로벌 네트워크', tab: 'global' },
        { label: '미분류 데이터베이스', tab: 'others', dividerBefore: true },
        // 대용량 업로드는 한 화면에서 국내/글로벌을 인페이지 탭으로 전환한다(BulkUploadSection).
        { label: '대용량 업로드', tab: 'bulk' },
      ],
    },
  ],
  ac: programSubnav('사업 현황', '내 사업 관리', AC_CATEGORIES),
  // FUND: 현황 → 내 펀드 → 펀드 종류(AC/VC/PE) 순. 종류별 화면은 메뉴만 선반영한 상태.
  fund: [
    {
      items: [
        { label: '펀드 현황', tab: 'dashboard' },
        // 운용역(담당자) 또는 등록자가 나인 펀드.
        { label: '내 펀드 관리', tab: 'mine', dividerBefore: true },
        { label: 'AC 펀드', tab: 'ac_fund', dividerBefore: true },
        { label: 'VC 펀드', tab: 'vc_fund' },
        { label: 'PE 펀드', tab: 'pe_fund' },
      ],
    },
  ],
  // M&A/PE는 AC와 동일한 사업 원장 구조(features/program)를 공유한다.
  mna: programSubnav('딜 현황', '내 딜 관리', MNA_CATEGORIES),
  admin: [
    {
      group: '시스템 관리',
      items: [
        { label: '권한 제어 콘솔', tab: 'permissions' },
        { label: '게시판 관리', tab: 'boards' },
        { label: '산업태그 관리', tab: 'industries' },
        { label: '분야태그 관리', tab: 'fields' },
        { label: '구분태그 관리', tab: 'categories' },
        { label: '권역태그 관리', tab: 'regions' },
        { label: '국가태그 관리', tab: 'countries' },
        { label: '투자단계 태그관리', tab: 'investment_stages', dividerBefore: true },
        { label: '기업구분 태그관리', tab: 'company_categories' },
        { label: '기업현황 태그관리', tab: 'company_statuses' },
        { label: '투자방식 태그관리', tab: 'investment_methods' },
        { label: '소재지 태그관리', tab: 'locations' },
        { label: '민감정보 관리', tab: 'sensitive', dividerBefore: true },
        { label: '중복 병합 검증', tab: 'merge' },
        { label: '감사 로그 모니터', tab: 'audit' },
        { label: '다운로드 사유 로그', tab: 'downloads' },
      ],
    },
  ],
  // PROJECT도 AC와 동일한 사업 원장 구조(features/program)를 공유한다.
  project: programSubnav('프로젝트 현황', '내 프로젝트 관리', PROJECT_CATEGORIES),
  // OFFICE: 임직원 정보·전사 캘린더 + 게시판(공지사항 고정 + 일반, 아코디언 없이 평탄 나열).
  // 신규 게시판은 모두 이곳에 생성·노출된다.
  office: [
    {
      items: [
        // 대시보드를 최상단에 배치. AI 에이전트·전사 캘린더는 사이드바가 아니라 상단바
        // 전역 진입점(우측 슬라이드오버)에서만 연다.
        { label: '대시보드', tab: 'dashboard' },
        // 전사 인적·조직 정보 블록(조회 전용). 원장은 MANAGEMENT가 갖고 OFFICE는 확인만 한다.
        { label: '임직원 정보', tab: 'managers', dividerBefore: true },
        { label: '부서 정보', tab: 'departments' },
        { label: '지사 정보', tab: 'branches' },
        // 위 인적·조직 블록을 떼어내는 구분선.
        { label: '회의실 예약', tab: 'rooms', dividerBefore: true },
        // 회의록: STARTUP에서 이관. 회의실 예약과 같은 공간·회의 블록에 묶는다(골격만).
        { label: '회의록', tab: 'minutes' },
        // 전자결재 워크스페이스에서 통합 이관. 일정·공간 예약(캘린더·회의실)과 결재·거래처를
        // 구분선으로 나눈다. 아래 고정 게시판 그룹 경계가 이 블록과 공지사항을 다시 나눈다.
        { label: '전자결재', tab: 'approval', dividerBefore: true },
        { label: '거래처 정보', tab: 'clients' },
      ],
    },
    {
      // 게시 블록(위 업무 블록과는 그룹 경계 구분선으로만 나눈다).
      // 공지사항은 게시판이 아니라 전체 공지(global_notice) 게시글을 모아 보여주는 뷰이며,
      // 레지스트리와 무관한 고정 라우트이므로 dynamicKey 없이 단독 항목으로 둔다.
      // 게시판(POST)·자료실(ARCHIVE)은 각각 상위 메뉴 한 줄로 두고, 클릭하면 우측 플라이아웃에
      // 등록된 목록을 펼친다. 게시판이 늘어나도 사이드바가 길어지지 않는다.
      group: '게시',
      items: [
        { label: '공지사항', tab: 'notices', iconKey: 'megaphone' },
        { label: '게시판', dynamicKey: 'boards' },
        { label: '자료실', dynamicKey: 'archives' },
      ],
    },
  ],
  management: [
    {
      group: '경영지원',
      items: [
        { label: '경영 현황', tab: 'dashboard' },
        { label: '조직 관리', tab: 'departments', dividerBefore: true },
        { label: '지사 관리', tab: 'branches' },
        { label: '직책 관리', tab: 'positions' },
        { label: '직급 관리', tab: 'ranks' },
        { label: '호봉 관리', tab: 'pay_steps' },
        { label: '인사 관리', tab: 'hr', dividerBefore: true },
        { label: '자산 관리', tab: 'assets' },
        { label: '재무 관리', tab: 'finance' },
        { label: 'KPI 관리', tab: 'kpi', dividerBefore: true },
      ],
    },
  ],
}

/** 그룹 목록에서 기본 활성 탭(첫 tab 보유 항목, 하위 항목 포함)을 반환. 없으면 undefined. */
export function firstTab(groups: SubNavGroup[] | undefined): string | undefined {
  for (const g of groups ?? []) {
    for (const item of g.items) {
      if (item.tab) return item.tab
      const childTab = item.children?.find((c) => c.tab)?.tab
      if (childTab) return childTab
    }
  }
  return undefined
}

/** 그룹 목록에 존재하는 모든 탭 키 집합(하위 항목 포함). */
function allTabs(groups: SubNavGroup[] | undefined): Set<string> {
  const tabs = new Set<string>()
  for (const g of groups ?? []) {
    for (const item of g.items) {
      if (item.tab) tabs.add(item.tab)
      for (const c of item.children ?? []) if (c.tab) tabs.add(c.tab)
    }
  }
  return tabs
}

/**
 * 상세 라우트 경로에서 활성 탭을 유추한다.
 * 예: pathname `/networks/global/123`, wsPath `/networks` → 세그먼트 `global`.
 * 해당 세그먼트가 사이드바 탭으로 존재할 때만 반환하고, 아니면 undefined.
 */
export function pathTabOf(
  pathname: string,
  wsPath: string,
  groups: SubNavGroup[] | undefined,
): string | undefined {
  const rest = pathname.slice(wsPath.length).replace(/^\/+/, '')
  const seg = rest.split('/')[0]
  if (!seg) return undefined
  return allTabs(groups).has(seg) ? seg : undefined
}
