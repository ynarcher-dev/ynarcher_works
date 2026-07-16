/** ADMIN 권한 콘솔에서 제어하는 역할(user_type) 목록. 근거: 3_2_workspace_admin.md §1.1 */
export const ROLES = [
  { key: 'super_admin', label: '관리자' },
  { key: 'executive', label: '경영진' },
  { key: 'management_support', label: '경영지원' },
  { key: 'fund_manager', label: '투자실' },
  { key: 'ac_business', label: '사업부' },
  { key: 'mna_manager', label: 'M&A팀' },
  { key: 'project_manager', label: '프로젝트팀' },
  { key: 'external_startup', label: '스타트업' },
  { key: 'external_expert', label: '전문가' },
  { key: 'temporary_guest', label: '게스트' },
  { key: 'read_only', label: '읽기 전용' },
] as const

export type RoleKey = (typeof ROLES)[number]['key']

/** 토글 매트릭스에 노출되는 워크스페이스(내부 + GUEST). DB workspace_key enum과 1:1. */
export const WORKSPACE_KEYS = [
  { key: 'office', label: 'OFFICE' },
  { key: 'startup', label: 'STARTUP' },
  { key: 'networks', label: 'NETWORKS' },
  { key: 'ac', label: 'AC' },
  { key: 'fund', label: 'FUND' },
  { key: 'mna', label: 'M&A/PE' },
  { key: 'project', label: 'PROJECT' },
  { key: 'management', label: 'MANAGEMENT' },
  { key: 'admin', label: 'ADMIN' },
  { key: 'guest', label: 'GUEST' },
] as const

export type PermLevel = 'none' | 'read' | 'write'

/** 다음 권한 단계 산출: 읽기/쓰기 토글 조합 → 목표 단계. */
export function nextLevel(current: PermLevel, toggle: 'read' | 'write', on: boolean): PermLevel {
  const hasRead = current === 'read' || current === 'write'
  const hasWrite = current === 'write'
  let read = hasRead
  let write = hasWrite
  if (toggle === 'read') {
    read = on
    if (!on) write = false // 읽기 해제 시 쓰기도 해제
  } else {
    write = on
    if (on) read = true // 쓰기 활성 시 읽기 자동 부여
  }
  return write ? 'write' : read ? 'read' : 'none'
}
