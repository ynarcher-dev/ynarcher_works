import type { WorkspaceKey } from '@/auth/types'

/** 사이드바 세부 메뉴 항목. tab은 페이지 내부 섹션을 제어하는 `?tab=` 쿼리 값. */
export interface SubNavItem {
  label: string
  /** 미지정 시 워크스페이스 루트(단일 대시보드 메뉴)를 의미한다. */
  tab?: string
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
        { label: '통합 검색', tab: 'search' },
        { label: 'AI 검색', tab: 'ai' },
        { label: '전사 캘린더', tab: 'calendar' },
        { label: '전문가 랭킹', tab: 'ranking' },
        { label: '임직원 디렉토리', tab: 'directory' },
      ],
    },
  ],
  networks: [
    {
      group: '마스터 DB 관리',
      items: [
        { label: '스타트업 마스터', tab: 'startups' },
        { label: '전문가 마스터', tab: 'experts' },
        { label: '협력사 마스터', tab: 'partners' },
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
        { label: '감사 로그 모니터', tab: 'audit' },
        { label: '다운로드 사유 로그', tab: 'downloads' },
      ],
    },
  ],
  project: [{ group: 'PROJECT 메인', items: [{ label: '프로젝트 대시보드' }] }],
}

/** 그룹 목록에서 기본 활성 탭(첫 tab 보유 항목)을 반환. 없으면 undefined. */
export function firstTab(groups: SubNavGroup[] | undefined): string | undefined {
  for (const g of groups ?? []) {
    for (const item of g.items) {
      if (item.tab) return item.tab
    }
  }
  return undefined
}
