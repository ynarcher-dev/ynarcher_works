import { create } from 'zustand'

export type GuestStatus = 'loading' | 'authenticated' | 'unauthenticated'

export interface GuestUser {
  id: string
  name: string
  role: string
}

/**
 * 세션에 고정된 사업(맥락). **한 세션은 언제나 하나**이며, 바꾸려면 토큰을 다시 받는다
 * (사이드바 상단 전환기 → guest-auth-context). 2026-09-05 이전에는 로그인에 쓴 사업 코드가
 * 이 값을 정했고 세션 안에서 바꿀 수 없었다 — 계정이 사업마다 갈려 있었기 때문이다.
 * 근거: 3_9_1_guest_unified_account.md §7
 */
export interface GuestProgram {
  id: string
  title: string
  code: string | null
  /** 이 맥락을 만든 명부 행. 전환 요청의 대상 키다. */
  participantId?: string | null
  /**
   * 이 맥락의 자격 — 'startups'(참가기업) | 'networks'(참가전문가).
   * **화면을 가르는 축은 계정이 아니라 이 값이다**: 같은 사람이 한 사업에 두 자격으로
   * 참여하면 맥락이 둘이고 각각 다른 화면이 열린다(3_9_1 §4).
   */
  persona?: GuestPersona | null
}

/** 참여 자격. 명부의 두 탭(참가기업 / 참가전문가)과 같은 축이다. */
export type GuestPersona = 'startups' | 'networks'

/** 자격 라벨 — 화면 어디서나 같은 말을 쓴다(명부 탭과 같은 어휘). */
export const PERSONA_LABEL: Record<GuestPersona, string> = {
  startups: '참가기업',
  networks: '참가전문가',
}

/** 전환기 목록의 한 줄. 로그인 응답과 세션 갱신이 같은 모양으로 돌려준다. */
export interface GuestContextChoice {
  participantId: string
  programId: string
  entityKey: string
  code: string | null
  title: string
  role?: string
  persona?: GuestPersona | null
  accessEndsAt?: string | null
}

interface GuestState {
  status: GuestStatus
  user: GuestUser | null
  program: GuestProgram | null
  /** 지금 계정이 갈 수 있는 곳 전부. 1개 이하이면 전환기를 세우지 않는다. */
  contexts: GuestContextChoice[]
  accessToken: string | null
  setSession: (token: string, user: GuestUser, program: GuestProgram | null) => void
  setContexts: (contexts: GuestContextChoice[]) => void
  setStatus: (status: GuestStatus) => void
  reset: () => void
}

const STORAGE_KEY = 'ynw.guest.session'

/** 게스트 세션 상태(커스텀 JWT + 사용자). localStorage에 지속. */
export const useGuestStore = create<GuestState>((set) => ({
  status: 'loading',
  user: null,
  program: null,
  contexts: [],
  accessToken: null,
  setSession: (accessToken, user, program) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ accessToken, user, program }))
    set({ accessToken, user, program, status: 'authenticated' })
  },
  // 목록은 저장하지 않는다 — 담당자가 문을 닫으면 즉시 바뀌는 값이라, 복원된 옛 목록은
  // 누를 수 없는 줄을 보여 준다. 앱 구동 때 세션 갱신이 함께 받아 온다.
  setContexts: (contexts) => set({ contexts }),
  setStatus: (status) => set({ status }),
  reset: () => {
    localStorage.removeItem(STORAGE_KEY)
    set({
      accessToken: null,
      user: null,
      program: null,
      contexts: [],
      status: 'unauthenticated',
    })
  },
}))

export const GUEST_STORAGE_KEY = STORAGE_KEY
