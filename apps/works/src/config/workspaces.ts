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
  { key: 'hub', label: 'HUB', path: '/hub', implemented: true },
  { key: 'networks', label: 'NETWORKS', path: '/networks', implemented: true },
  { key: 'ac', label: 'AC', path: '/ac', implemented: true },
  { key: 'fund', label: 'FUND', path: '/fund', implemented: true },
  { key: 'mna', label: 'M&A', path: '/mna', implemented: true },
  { key: 'admin', label: 'ADMIN', path: '/admin', implemented: true },
  { key: 'project', label: 'PROJECT', path: '/project', implemented: false },
  { key: 'management', label: 'MANAGEMENT', path: '/management', implemented: false },
]
