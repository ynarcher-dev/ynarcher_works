import type { WorkspaceKey } from '@/auth/types'

/** 사이드바 세부 메뉴 항목. tab은 페이지 내부 섹션을 제어하는 `?tab=` 쿼리 값. */
export interface SubNavItem {
  label: string
  /** 미지정 시 워크스페이스 루트(단일 대시보드 메뉴)를 의미한다. */
  tab?: string
  /** 하위 항목(아코디언). 지정 시 이 항목은 펼침/접힘 그룹 헤더가 된다. */
  children?: SubNavItem[]
  /**
   * 하위 항목을 런타임 스토어에서 주입(둘 다 아코디언 없이 상위 단독 항목으로 평탄 나열).
   * - 'boards': 일반 게시판 레지스트리(고정 게시판 제외) — OFFICE에 노출
   * - 'pinnedBoards': 고정 게시판(예: 공지사항) — HUB에 노출
   */
  dynamicKey?: 'boards' | 'pinnedBoards'
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
 * 워크스페이스별 좌측 사이드바 세부 메뉴.
 * 근거: 2_app_layout_navigation.md §3.1 (Contextual Sidebar Menu)
 */
export const WORKSPACE_SUBNAV: Partial<Record<WorkspaceKey, SubNavGroup[]>> = {
  hub: [
    {
      items: [
        { label: '대시보드', tab: 'dashboard' },
        { label: 'AI 에이전트', tab: 'ai' },
      ],
    },
  ],
  startup: [
    {
      items: [
        { label: '대시보드', tab: 'dashboard' },
        // 투자/보육/발굴/기타 4분류. 발굴기업이 기존 스타트업 마스터 디렉토리.
        { label: '투자기업', tab: 'invested', dividerBefore: true },
        { label: '보육기업', tab: 'incubated' },
        { label: '발굴기업', tab: 'discovered' },
        { label: '기타기업', tab: 'etc' },
        { label: '회의록', tab: 'minutes', dividerBefore: true },
        { label: '아처스캔', tab: 'archerscan' },
        { label: '대용량 업로드', tab: 'bulk' },
      ],
    },
  ],
  networks: [
    {
      items: [{ label: '대시보드', tab: 'dashboard' }],
    },
    {
      group: '마스터 네트워크 관리',
      items: [
        { label: 'BAN 네트워크', tab: 'van' },
        { label: 'EXP 네트워크', tab: 'exp' },
        { label: '전문가 네트워크', tab: 'experts', dividerBefore: true },
        { label: '투자사 네트워크', tab: 'investors' },
        { label: '기업 네트워크', tab: 'corporates', dividerBefore: true },
        { label: '기관 네트워크', tab: 'institutions' },
        { label: '대학 네트워크', tab: 'universities' },
        { label: '외주/거래 네트워크', tab: 'vendors' },
        { label: '기타 네트워크', tab: 'etc' },
      ],
    },
    {
      group: '데이터 관리',
      items: [
        // 글로벌 네트워크: 미분류 데이터베이스 위에 구분선으로 구획(기능은 보류, 메뉴만 제공).
        { label: '글로벌 네트워크', tab: 'global' },
        { label: '미분류 데이터베이스', tab: 'others', dividerBefore: true },
        { label: '대용량 업로드', tab: 'bulk' },
      ],
    },
  ],
  ac: [{ group: 'AC 메인', items: [{ label: 'AC 대시보드' }] }],
  fund: [{ group: 'FUND 메인', items: [{ label: '투자 대시보드' }] }],
  mna: [
    {
      group: 'M&A 딜',
      items: [
        { label: '딜 소싱 칸반', tab: 'kanban' },
        { label: '매칭 매트릭스', tab: 'matching' },
      ],
    },
  ],
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
        { label: '민감정보 관리', tab: 'sensitive', dividerBefore: true },
        { label: '중복 병합 검증', tab: 'merge' },
        { label: '감사 로그 모니터', tab: 'audit' },
        { label: '다운로드 사유 로그', tab: 'downloads' },
      ],
    },
  ],
  project: [{ group: 'PROJECT 메인', items: [{ label: '프로젝트 대시보드' }] }],
  // OFFICE: 임직원 정보·전사 캘린더 + 게시판(공지사항 고정 + 일반, 아코디언 없이 평탄 나열).
  // 신규 게시판은 모두 이곳에 생성·노출된다.
  office: [
    {
      items: [
        { label: '임직원 정보', tab: 'managers' },
        { label: '전사 캘린더', tab: 'calendar' },
        { label: '회의실 예약', tab: 'rooms' },
      ],
    },
    {
      // 고정 게시판(공지사항·공용자료실) — 상단 참조 영역으로 구분선 분리.
      group: '고정 게시판',
      items: [{ label: '고정 게시판', dynamicKey: 'pinnedBoards' }],
    },
    {
      // 일반 게시판(인사이트·신규 생성분).
      group: '게시판',
      items: [{ label: '게시판', dynamicKey: 'boards' }],
    },
  ],
  // 전자결재: OFFICE에서 분리한 독립 워크스페이스(전자결재 + 거래처 정보). 현재 페이지 골격만.
  approval: [
    {
      items: [
        { label: '전자결재', tab: 'approval' },
        { label: '거래처 정보', tab: 'clients' },
      ],
    },
    // 거래처 정보 아래 트레일링 구분선(항목 없는 그룹 → 그룹 경계 SidebarDivider만 렌더).
    { items: [] },
  ],
  management: [
    {
      group: '경영지원',
      items: [
        { label: '대시보드', tab: 'dashboard' },
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
