import { create } from 'zustand'

export type GuestStatus = 'loading' | 'authenticated' | 'unauthenticated'

export interface GuestUser {
  id: string
  name: string
  role: string
}

/**
 * 세션에 고정된 사업. 로그인에 사용한 사업 코드가 이 값을 정하며, 세션 안에서 바뀌지 않는다 —
 * 다른 사업은 그 사업의 코드로 다시 들어와야 한다(3_9_workspace_guest.md §2).
 */
export interface GuestProgram {
  id: string
  title: string
  code: string | null
}

interface GuestState {
  status: GuestStatus
  user: GuestUser | null
  program: GuestProgram | null
  accessToken: string | null
  setSession: (token: string, user: GuestUser, program: GuestProgram | null) => void
  setStatus: (status: GuestStatus) => void
  reset: () => void
}

const STORAGE_KEY = 'ynw.guest.session'

/** 게스트 세션 상태(커스텀 JWT + 사용자). localStorage에 지속. */
export const useGuestStore = create<GuestState>((set) => ({
  status: 'loading',
  user: null,
  program: null,
  accessToken: null,
  setSession: (accessToken, user, program) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ accessToken, user, program }))
    set({ accessToken, user, program, status: 'authenticated' })
  },
  setStatus: (status) => set({ status }),
  reset: () => {
    localStorage.removeItem(STORAGE_KEY)
    set({ accessToken: null, user: null, program: null, status: 'unauthenticated' })
  },
}))

export const GUEST_STORAGE_KEY = STORAGE_KEY
