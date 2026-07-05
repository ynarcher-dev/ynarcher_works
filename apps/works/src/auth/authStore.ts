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
  status: 'loading',
  user: null,
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
  const level = user?.permissions[workspace]?.level
  return level === 'read' || level === 'write'
}
