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
  /**
   * 이 맥락이 무엇인가 — 사업(`program`·`ma_program`) 또는 조합(`fund`).
   *
   * 2026-09-09에 FUND가 들어오면서 필요해졌다. **화면 구성을 가르는 축**이며(사업개요 대
   * 조합 개요), 자격(`persona`)과는 다른 물음에 답한다 — 저쪽은 *누구로 들어왔는가*이고
   * 이쪽은 *어디에 들어왔는가*다. 값이 없으면 사업으로 읽는다(구 세션 복원).
   */
  entityKey?: GuestEntityKey | null
  /** 이 맥락을 만든 명부 행. 전환 요청의 대상 키다. */
  participantId?: string | null
  /**
   * 이 맥락의 자격 — 'startups'(참여 기업) | 'networks'(참여 전문가).
   * **화면을 가르는 축은 계정이 아니라 이 값이다**: 같은 사람이 한 사업에 두 자격으로
   * 참여하면 맥락이 둘이고 각각 다른 화면이 열린다(3_9_1 §4).
   */
  persona?: GuestPersona | null
}

/** 참여 자격. 명부의 두 탭(참여 기업 / 참여 전문가)과 같은 축이다. */
export type GuestPersona = 'startups' | 'networks'

/** 맥락의 종류. WORKS의 통합 원장 `entity_key`와 같은 값이며 서버가 실어 보낸다. */
export type GuestEntityKey = 'program' | 'ma_program' | 'fund'

/**
 * 맥락의 종류를 부르는 말 — 전환기 목록에서 이름 앞에 선다.
 *
 * 종류가 하나였을 때는 필요 없었다. 셋이 되면서 **이름만으로는 어느 성격의 자리인지
 * 답하지 못하게 됐다** — 같은 회사가 사업에도 조합에도 걸리면 목록의 두 줄이 서로 다른
 * 화면으로 데려가는데, 그 차이가 제목에는 드러나지 않는다.
 *
 * **색은 여전히 상태만의 것이다.** 2026-09-13에 이 라벨이 고른 목록(로그인 직후 선택·전환기
 * 펼침·개요 요약)에서 중립 태그로 서지만, 중립은 신호색이 아니라 분류를 담는 그릇이다 —
 * 종류마다 색을 주는 것과는 다른 일이며, 조립 규칙은 `contextDisplay.ts`가 소유한다.
 * 어두운 사이드바 표면에서는 태그 대신 글자로 선다(그 자리의 대비 규격이 다르다).
 */
export const CONTEXT_KIND_LABEL: Record<GuestEntityKey, string> = {
  program: '프로젝트',
  ma_program: 'M&A 프로젝트',
  fund: 'FUND',
}

/** 종류 라벨. 모르는 값(구 세션·새 종류)이면 아무 말도 하지 않는다 — 지어내지 않는다. */
export function contextKindLabel(key: string | null | undefined): string | null {
  return key ? (CONTEXT_KIND_LABEL[key as GuestEntityKey] ?? null) : null
}

/** 자격 라벨 — 화면 어디서나 같은 말을 쓴다(명부 탭과 같은 어휘). */
export const PERSONA_LABEL: Record<GuestPersona, string> = {
  startups: '참여 기업',
  networks: '참여 전문가',
}

/** 전환기 목록의 한 줄. 로그인 응답과 세션 갱신이 같은 모양으로 돌려준다. */
export interface GuestContextChoice {
  participantId: string
  programId: string
  entityKey: string
  code: string | null
  title: string
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
