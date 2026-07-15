export type WorkspaceKey =
  | 'networks'
  | 'startup'
  | 'ac'
  | 'fund'
  | 'mna'
  | 'project'
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
