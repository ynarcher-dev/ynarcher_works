import type { WorkspaceKey } from '@/auth/types'

export interface WorkspaceNavItem {
  key: WorkspaceKey
  label: string
  path: string
  /** 아직 구현되지 않은 워크스페이스는 false (후속 Phase에서 활성화). */
  implemented: boolean
  /** 스위처에서 워크스페이스가 무엇을 하는지 한 줄로 설명하는 부제. */
  description?: string
  /** 이 항목부터 시작되는 스위처 섹션명. 지정 시 위에 섹션 헤더(구분선+라벨)를 그린다. */
  groupLabel?: string
}

/**
 * WORKS 앱 8대 메뉴 네비게이션 정의(GUEST 제외).
 * `groupLabel`은 스위처 4개 구획(업무 허브 / 마스터·네트워크 / 투자 사업 / 경영·시스템)의 시작 항목에만 부여한다.
 */
export const WORKSPACES: WorkspaceNavItem[] = [
  // 업무 허브 — 전사 공통 업무 허브로 최상단에 노출(구 HUB 대시보드·AI 에이전트 통합)
  {
    key: 'office',
    label: 'OFFICE',
    path: '/office',
    implemented: true,
    groupLabel: '업무 허브',
    description: '전사 공통 업무·대시보드',
  },
  // 마스터·네트워크 — 조직의 원장(SSOT) 데이터
  {
    key: 'startup',
    label: 'STARTUP',
    path: '/startup',
    implemented: true,
    groupLabel: '마스터·네트워크',
    description: '투자·보육 기업 관리',
  },
  {
    key: 'networks',
    label: 'NETWORKS',
    path: '/networks',
    implemented: true,
    description: '전문가·투자사 네트워크 원장',
  },
  // 투자 사업 — 딜·펀드 실행 라인
  {
    key: 'ac',
    label: 'AC',
    path: '/ac',
    implemented: true,
    groupLabel: '투자 사업',
    description: '액셀러레이팅 사업 관리',
  },
  { key: 'mna', label: 'M&A/PE', path: '/mna', implemented: true, description: '인수·합병·경영참여 딜 관리' },
  {
    key: 'project',
    label: 'PROJECT',
    path: '/project',
    implemented: true,
    description: '수행 프로젝트 관리',
  },
  { key: 'fund', label: 'FUND', path: '/fund', implemented: true, description: '펀드·투자 운용' },
  // 경영·시스템 — 백오피스 및 시스템 관리
  {
    key: 'management',
    label: 'MANAGEMENT',
    path: '/management',
    implemented: true,
    groupLabel: '경영·시스템',
    description: '인사·재무·자산 관리',
  },
  { key: 'admin', label: 'ADMIN', path: '/admin', implemented: true, description: '시스템·권한 관리' },
]
