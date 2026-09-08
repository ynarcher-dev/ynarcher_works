/**
 * 화면이 아는 워크스페이스 키.
 *
 * DB `workspace_key` enum의 부분집합이다. 지금 빠져 있는 것은 `project_retired` 하나로,
 * 2026-09-07에 폐지된 구 PROJECT의 값이다 — `system_events`의 과거 기록이 그 값을 쓰고 있어
 * 지우지 않고, 2026-09-09에 AC가 `project`라는 이름을 받으면서 자리를 비켜 주도록 개명했다.
 * 화면이 모르는 키는 어떤 워크스페이스도 열지 않으므로, 그 권한 행이 남아 있어도 무해하다.
 *
 * **`project`는 구 AC다**(2026-09-09 개명). enum RENAME VALUE로 바꿔 저장된 권한 행이 그대로
 * 따라왔으므로 여기 값과 DB 값은 여전히 같은 것을 가리킨다.
 */
export type WorkspaceKey =
  | 'networks'
  | 'startup'
  | 'project'
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
