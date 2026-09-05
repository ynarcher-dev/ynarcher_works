import { anonHeaders, functionsBase } from '@/lib/supabase'
import {
  useGuestStore,
  type GuestContextChoice,
  type GuestPersona,
  type GuestProgram,
  type GuestUser,
} from '@/auth/guestStore'

export interface GuestCredentials {
  /** ID = 원장에 등록된 이메일. */
  email: string
  /** 비밀번호. 계정에 아직 없으면 원장의 연락처(숫자만)가 초기 비밀번호다. */
  password: string
}

/** JWT 페이로드에서 만료 시각(exp, 초)을 추출. 실패 시 0. */
function jwtExp(token: string): number {
  try {
    const payload = JSON.parse(atob(token.split('.')[1] ?? '')) as {
      exp?: number
    }
    return payload.exp ?? 0
  } catch {
    return 0
  }
}

interface SessionResponse {
  accessToken: string
  user: { id: string; name: string; user_type: string }
  context?: {
    participant_id: string
    program_id: string
    entity_key: string
    code: string | null
    title: string
    persona: string | null
  } | null
}

interface LoginResponse extends Partial<SessionResponse> {
  mustChangePassword?: boolean
  changeTicket?: string
  selectTicket?: string
  choices?: GuestContextChoice[]
  accessible?: boolean
  message?: string
}

/**
 * 로그인 결과 — 네 갈래다. 화면은 이 종류만 보고 다음 단계를 정한다.
 * · session   : 갈 곳이 하나여서 바로 들어갔다
 * · password  : 비밀번호를 아직 정하지 않았다
 * · choose    : 갈 곳이 둘 이상이라 골라야 한다
 * · none      : 본인은 맞으나 지금 들어갈 사업이 없다
 */
export type GuestLoginResult =
  | { kind: 'session' }
  | { kind: 'password'; changeTicket: string }
  | { kind: 'choose'; selectTicket: string; choices: GuestContextChoice[] }
  | { kind: 'none'; message: string }

/** guest-auth-refresh가 돌려주는 원장 기준의 현재 값. 마이페이지의 데이터 원본이기도 하다. */
export interface GuestMe {
  user: { id: string; name: string; user_type: string; email: string | null }
  program: {
    id: string
    title: string
    code: string | null
    /** 운영 상태만 온다 — AC 제안 단계(시도·선정·미선정)는 내부 정보라 서버가 null로 지운다. */
    status: string | null
    start_date: string | null
    end_date: string | null
    host_organization: string | null
  }
  /** 이 맥락의 자격 — startups(참여 기업) | networks(참여 전문가). 2026-09-05 역할 배열을 대체한다. */
  participation: { persona: GuestPersona | null; joined_at: string | null }
  company: { name: string } | null
  currentParticipantId?: string | null
  contexts?: GuestContextChoice[]
}

function applySession(data: SessionResponse): void {
  const ctx = data.context ?? null
  useGuestStore.getState().setSession(
    data.accessToken,
    {
      id: data.user.id,
      name: data.user.name,
      role: data.user.user_type,
    },
    ctx
      ? {
          id: ctx.program_id,
          title: ctx.title,
          code: ctx.code,
          participantId: ctx.participant_id,
          persona: (ctx.persona as GuestPersona | null) ?? null,
        }
      : null,
  )
}

async function post<T>(
  path: string,
  body: unknown,
  accessToken?: string,
): Promise<{ ok: boolean; status: number; data: T }> {
  const res = await fetch(`${functionsBase}/${path}`, {
    method: 'POST',
    headers: accessToken
      ? { ...anonHeaders, Authorization: `Bearer ${accessToken}` }
      : anonHeaders,
    body: JSON.stringify(body),
  })
  return { ok: res.ok, status: res.status, data: (await res.json()) as T }
}

/** 로그인·비밀번호 설정 응답을 같은 규칙으로 읽는다(두 경로의 착지가 같다). */
function readLanding(data: LoginResponse): GuestLoginResult {
  if (data.mustChangePassword && data.changeTicket) {
    return { kind: 'password', changeTicket: data.changeTicket }
  }
  if (data.selectTicket && data.choices) {
    return { kind: 'choose', selectTicket: data.selectTicket, choices: data.choices }
  }
  if (data.accessible === false) {
    return { kind: 'none', message: data.message ?? '현재 접근 가능한 사업이 없습니다.' }
  }
  if (!data.accessToken || !data.user) throw new Error('로그인에 실패했습니다.')
  applySession(data as SessionResponse)
  return { kind: 'session' }
}

/**
 * 게스트 인증 서비스(커스텀 JWT).
 *
 * 로그인은 이메일 + 비밀번호 두 값이다(2026-09-05 — 사업 코드는 로그인 요소가 아니다).
 * 어느 사업으로 들어갈지는 로그인 **이후에** 고르며, 갈 곳이 하나면 그 단계를 건너뛴다.
 */
export const guestAuth = {
  /** localStorage 세션 복원(만료 검사 포함). */
  restore(): void {
    const raw = localStorage.getItem('ynw.guest.session')
    if (!raw) {
      useGuestStore.getState().setStatus('unauthenticated')
      return
    }
    try {
      const { accessToken, user, program } = JSON.parse(raw) as {
        accessToken: string
        user: GuestUser
        program?: GuestProgram | null
      }
      if (jwtExp(accessToken) * 1000 < Date.now()) {
        useGuestStore.getState().reset()
        return
      }
      useGuestStore.getState().setSession(accessToken, user, program ?? null)
    } catch {
      useGuestStore.getState().reset()
    }
  },

  /**
   * 로그인. 결과 종류에 따라 화면이 다음 단계를 정한다.
   * 실패는 사유를 가리지 않는 한 문장으로 던진다(계정 열거 차단).
   */
  async login(creds: GuestCredentials): Promise<GuestLoginResult> {
    const { ok, data } = await post<LoginResponse>('guest-auth-login', creds)
    if (!ok) throw new Error(data?.message ?? '로그인에 실패했습니다.')
    return readLanding(data)
  },

  /** 새 비밀번호 설정(최초 진입·재설정). 착지는 로그인과 같은 규칙을 탄다. */
  async setPassword(changeTicket: string, newPassword: string): Promise<GuestLoginResult> {
    const { ok, data } = await post<LoginResponse>('guest-auth-password', {
      changeTicket,
      newPassword,
    })
    if (!ok) throw new Error(data?.message ?? '비밀번호 설정에 실패했습니다.')
    return readLanding(data)
  },

  /** 재설정 링크를 설정 티켓으로 바꾼다. 링크는 한 번만 쓰인다. */
  async consumeResetLink(resetToken: string): Promise<{ changeTicket: string; name: string }> {
    const { ok, data } = await post<{ changeTicket?: string; name?: string; message?: string }>(
      'guest-password-reset',
      { resetToken },
    )
    if (!ok || !data.changeTicket) {
      throw new Error(data?.message ?? '링크가 만료되었거나 이미 사용되었습니다.')
    }
    return { changeTicket: data.changeTicket, name: data.name ?? '' }
  },

  /**
   * 맥락을 고른다(로그인 직후) 또는 갈아탄다(사이드바).
   *
   * 선택 티켓이 있으면 그것으로, 없으면 살아 있는 세션으로 요청한다. 어느 쪽이든
   * **요청한 대상이 실제로 열려 있는지는 서버가 다시 확인한다** — 클라이언트가 보낸
   * 명부 행 id를 그대로 믿으면 남의 사업 세션을 받는 길이 열린다.
   */
  async enterContext(participantId: string, selectTicket?: string): Promise<void> {
    const token = selectTicket ? undefined : (useGuestStore.getState().accessToken ?? undefined)
    const { ok, data } = await post<SessionResponse & { message?: string }>(
      'guest-auth-context',
      selectTicket ? { selectTicket, participantId } : { participantId },
      token,
    )
    if (!ok || !data.accessToken) {
      throw new Error(data?.message ?? '해당 사업으로 들어갈 수 없습니다.')
    }
    applySession(data)
  },

  /**
   * 세션 새로고침 — 원장의 현재 값(이름·사업 정보)과 전환기 목록을 되받아 저장한다.
   *
   * 이름은 로그인 시점의 복사본이 localStorage에 남는 구조라, WORKS에서 원장을 고쳐도
   * 이 호출 없이는 게스트 화면이 영영 옛 이름을 보여준다. 앱 구동과 마이페이지 진입에서 부른다.
   * 401은 '접근이 닫혔다'는 뜻이므로 그 자리에서 로그아웃한다(즉시 차단 규칙).
   */
  async refreshSession(): Promise<GuestMe | null> {
    const token = useGuestStore.getState().accessToken
    if (!token) return null
    const { ok, status, data } = await post<GuestMe & { message?: string }>(
      'guest-auth-refresh',
      {},
      token,
    )
    if (status === 401) {
      useGuestStore.getState().reset()
      return null
    }
    if (!ok) throw new Error(data?.message ?? '세션 정보를 불러오지 못했습니다.')
    useGuestStore.getState().setSession(
      token,
      { id: data.user.id, name: data.user.name, role: data.user.user_type },
      {
        id: data.program.id,
        title: data.program.title,
        code: data.program.code,
        participantId: data.currentParticipantId ?? null,
      },
    )
    useGuestStore.getState().setContexts(data.contexts ?? [])
    return data
  },

  /** 비밀번호 변경(로그인 상태). 현재 비밀번호 재확인을 거친다. */
  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    const token = useGuestStore.getState().accessToken
    if (!token) throw new Error('로그인이 필요합니다.')
    const { ok, data } = await post<{ ok?: boolean; message?: string }>(
      'guest-auth-password',
      { currentPassword, newPassword },
      token,
    )
    if (!ok) throw new Error(data?.message ?? '비밀번호 변경에 실패했습니다.')
  },

  signOut(): void {
    useGuestStore.getState().reset()
  },
}
