/**
 * 화면이 아는 워크스페이스 키.
 *
 * DB `workspace_key` enum에는 `project`가 남아 있으나 여기에는 없다 — PROJECT는 2026-09-07에
 * 폐지되어 AC로 합쳐졌고, enum 값은 `system_events`의 과거 기록이 그 값을 쓰고 있어 지우지
 * 않았다. 즉 이 목록은 enum의 부분집합이며, 사라진 워크스페이스의 권한 행이 남아 있어도
 * 여기에 없으므로 어떤 화면도 열지 않는다.
 */
export type WorkspaceKey =
  | 'networks'
  | 'startup'
  | 'ac'
  | 'fund'
  | 'mna'
  | 'management'
  | 'office'
  | 'admin'
  | 'guest'

export type PermissionLevel = 'none' | 'read' | 'write'

export interface WorkspacePermission {
  level: PermissionLevel
  scopeType: string
  scopeId: string | null
}

export interface AuthUser {
  id: string
  name: string
  email: string | null
  role: string
  permissions: Partial<Record<WorkspaceKey, WorkspacePermission>>
}

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated'
