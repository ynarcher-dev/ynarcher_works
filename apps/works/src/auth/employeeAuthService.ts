import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/auth/authStore'
import type { AuthUser, WorkspaceKey, WorkspacePermission } from '@/auth/types'

interface PermRow {
  workspace_key: string
  permission_level: string
  scope_type: string
  scope_id: string | null
}

/** 로그인한 임직원의 앱 프로필 + 워크스페이스 권한 스냅샷 로드. */
async function loadProfile(authUserId: string): Promise<AuthUser | null> {
  const { data: u } = await supabase
    .from('users')
    .select('id, name, email, user_type')
    .eq('auth_user_id', authUserId)
    .maybeSingle()
  if (!u) return null

  const { data: perms } = await supabase
    .from('workspace_permissions')
    .select('workspace_key, permission_level, scope_type, scope_id')
    .eq('user_id', u.id)

  const permissions: Partial<Record<WorkspaceKey, WorkspacePermission>> = {}
  for (const p of (perms ?? []) as PermRow[]) {
    permissions[p.workspace_key as WorkspaceKey] = {
      level: p.permission_level as WorkspacePermission['level'],
      scopeType: p.scope_type,
      scopeId: p.scope_id,
    }
  }
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.user_type,
    permissions,
  }
}

/**
 * 임직원 인증 서비스(표준 JWT). AuthService 인터페이스의 임직원 구현.
 * session_version 무효화는 서버(RLS 헬퍼)가 강제하며, 여기서는 스냅샷 로드만 담당한다.
 */
export const employeeAuth = {
  async init(): Promise<void> {
    const { data } = await supabase.auth.getSession()
    if (data.session) {
      useAuthStore.getState().setUser(await loadProfile(data.session.user.id))
    } else {
      useAuthStore.getState().setStatus('unauthenticated')
    }
    supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session) {
        useAuthStore.getState().setUser(await loadProfile(session.user.id))
      } else {
        useAuthStore.getState().reset()
      }
    })
  },

  async signIn(email: string, password: string): Promise<void> {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
  },

  async signOut(): Promise<void> {
    await supabase.auth.signOut()
    useAuthStore.getState().reset()
  },
}
