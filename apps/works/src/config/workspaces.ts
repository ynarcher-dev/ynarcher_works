import type { WorkspaceKey } from '@/auth/types'

export interface WorkspaceNavItem {
  key: WorkspaceKey
  label: string
  path: string
  /** 아직 구현되지 않은 워크스페이스는 false (후속 Phase에서 활성화). */
  implemented: boolean
}

/** WORKS 앱 8대 메뉴 네비게이션 정의(GUEST 제외). */
export const WORKSPACES: WorkspaceNavItem[] = [
  // OFFICE — 전사 공통 업무 허브로 최상단에 노출(구 HUB 대시보드·AI 에이전트 통합)
  { key: 'office', label: 'OFFICE', path: '/office', implemented: true },
  { key: 'startup', label: 'STARTUP', path: '/startup', implemented: true },
  { key: 'networks', label: 'NETWORKS', path: '/networks', implemented: true },
  { key: 'ac', label: 'AC', path: '/ac', implemented: true },
  { key: 'mna', label: 'M&A', path: '/mna', implemented: true },
  { key: 'project', label: 'PROJECT', path: '/project', implemented: true },
  { key: 'fund', label: 'FUND', path: '/fund', implemented: true },
  { key: 'management', label: 'MANAGEMENT', path: '/management', implemented: true },
  // 시스템 관리 — 스위처에서 구분선 아래에 별도 노출
  { key: 'admin', label: 'ADMIN', path: '/admin', implemented: true },
]
