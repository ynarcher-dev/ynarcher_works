import type { WorkspaceKey } from '@/auth/types'

/** 사이드바 세부 메뉴 항목. tab은 페이지 내부 섹션을 제어하는 `?tab=` 쿼리 값. */
export interface SubNavItem {
  label: string
  /** 미지정 시 워크스페이스 루트(단일 대시보드 메뉴)를 의미한다. */
  tab?: string
  /** 하위 항목(아코디언). 지정 시 이 항목은 펼침/접힘 그룹 헤더가 된다. */
  children?: SubNavItem[]
  /**
   * 하위 항목을 런타임 스토어에서 주입.
   * - 'boards': 게시판 레지스트리(아코디언, 고정 게시판 제외)
   * - 'pinnedBoards': 고정 게시판을 상위 단독 항목으로 펼침
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
        { label: '전사 캘린더', tab: 'calendar' },
        { label: '고정 게시판', dynamicKey: 'pinnedBoards' },
        { label: '게시판', dynamicKey: 'boards' },
      ],
    },
    {
      group: '마스터 정보',
      items: [
        { label: '임직원 정보', tab: 'managers' },
        { label: '스타트업 네트워크', tab: 'startups' },
        { label: '투자/전문가 네트워크', tab: 'experts' },
        { label: '협력사 네트워크', tab: 'orgs' },
      ],
    },
    {
      group: '현황 정보',
      items: [
        { label: '사업 현황', tab: 'ac' },
        { label: '글로벌/신사업 현황', tab: 'project' },
        { label: 'M&A/PE 현황', tab: 'mna' },
      ],
    },
    {
      group: '실적 정보',
      items: [
        { label: '투자현황', tab: 'fund' },
        { label: '경영현황', tab: 'management' },
      ],
    },
  ],
  startup: [
    {
      group: 'STARTUP 메인',
      items: [{ label: '스타트업 목록' }],
    },
  ],
  networks: [
    {
      group: '마스터 네트워크 관리',
      items: [
        { label: '전문가 네트워크', tab: 'experts' },
        { label: 'VAN 네트워크', tab: 'van' },
        { label: '투자사 네트워크', tab: 'investors' },
        { label: '기업 네트워크', tab: 'corporates', dividerBefore: true },
        { label: '기관 네트워크', tab: 'institutions' },
        { label: '대학 네트워크', tab: 'universities' },
        { label: '외주/거래 네트워크', tab: 'vendors' },
        { label: '미분류 네트워크', tab: 'others', dividerBefore: true },
      ],
    },
    {
      group: '데이터 관리',
      items: [
        { label: '중복 병합 검증', tab: 'merge' },
        { label: '성장 지표', tab: 'growth' },
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
        { label: '직책태그 관리', tab: 'positions' },
        { label: '직급태그 관리', tab: 'ranks' },
        { label: '구분태그 관리', tab: 'categories' },
        { label: '민감정보 관리', tab: 'sensitive' },
        { label: '감사 로그 모니터', tab: 'audit' },
        { label: '다운로드 사유 로그', tab: 'downloads' },
      ],
    },
  ],
  project: [{ group: 'PROJECT 메인', items: [{ label: '프로젝트 대시보드' }] }],
  management: [
    {
      group: '경영지원',
      items: [
        { label: '전자결재', tab: 'approval' },
        { label: '인사 관리', tab: 'hr' },
        { label: '재무·KPI', tab: 'finance' },
        { label: '자산 관리', tab: 'assets' },
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
