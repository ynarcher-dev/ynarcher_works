import { create } from 'zustand'
import type { AuthStatus, AuthUser, WorkspaceKey } from '@/auth/types'

interface AuthState {
  status: AuthStatus
  user: AuthUser | null
  setUser: (user: AuthUser | null) => void
  setStatus: (status: AuthStatus) => void
  reset: () => void
}

/**
 * 단일 세션 상태 관찰소(currentUser/userRole 단일 원천).
 * 하위 비즈니스 컴포넌트는 인증 방식(표준/커스텀)을 몰라도 이 스토어만 관찰한다.
 */
export const useAuthStore = create<AuthState>((set) => ({
  status: 'authenticated',
  user: {
    id: 'test-user-id',
    name: '테스트 관리자',
    email: 'admin@ynarcher.com',
    role: 'super_admin',
    permissions: {},
  },
  setUser: (user) =>
    set({ user, status: user ? 'authenticated' : 'unauthenticated' }),
  setStatus: (status) => set({ status }),
  reset: () => set({ user: null, status: 'unauthenticated' }),
}))

/** 워크스페이스 읽기 권한 보유 여부(read 또는 write). */
export function hasWorkspaceRead(
  user: AuthUser | null,
  workspace: WorkspaceKey,
): boolean {
  if (!user) return false
  // super_admin은 백엔드 RLS의 is_admin()과 동일하게 전 워크스페이스를 통과한다
  // (권한 행 없이 user_type만으로 판정). RLS 헬퍼 app.is_admin()과 프론트 정책 일치.
  if (user.role === 'super_admin') return true
  const level = user.permissions[workspace]?.level
  return level === 'read' || level === 'write'
}
