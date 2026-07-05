import { create } from 'zustand'

export type GuestStatus = 'loading' | 'authenticated' | 'unauthenticated'

export interface GuestUser {
  id: string
  name: string
  role: string
}

interface GuestState {
  status: GuestStatus
  user: GuestUser | null
  accessToken: string | null
  setSession: (token: string, user: GuestUser) => void
  setStatus: (status: GuestStatus) => void
  reset: () => void
}

const STORAGE_KEY = 'ynw.guest.session'

/** 게스트 세션 상태(커스텀 JWT + 사용자). localStorage에 지속. */
export const useGuestStore = create<GuestState>((set) => ({
  status: 'loading',
  user: null,
  accessToken: null,
  setSession: (accessToken, user) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ accessToken, user }))
    set({ accessToken, user, status: 'authenticated' })
  },
  setStatus: (status) => set({ status }),
  reset: () => {
    localStorage.removeItem(STORAGE_KEY)
    set({ accessToken: null, user: null, status: 'unauthenticated' })
  },
}))

export const GUEST_STORAGE_KEY = STORAGE_KEY
