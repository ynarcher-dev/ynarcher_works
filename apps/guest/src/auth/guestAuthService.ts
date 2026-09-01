import { anonHeaders, functionsBase } from '@/lib/supabase'
import { useGuestStore, type GuestProgram, type GuestUser } from '@/auth/guestStore'

export interface GuestCredentials {
  /** 사업 코드(6자리 영숫자). 코드가 곧 사업이라 세션이 여기에 고정된다. */
  businessCode: string
  /** ID = 원장에 등록된 이메일. */
  email: string
  /** 비밀번호. 처음에는 원장의 연락처(숫자만)가 초기 비밀번호다. */
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
  program?: { id: string; title: string; code: string | null } | null
}

interface LoginResponse extends Partial<SessionResponse> {
  mustChangePassword?: boolean
  changeTicket?: string
  message?: string
}

/** guest-auth-refresh가 돌려주는 원장 기준의 현재 값. 마이페이지의 데이터 원본이기도 하다. */
export interface GuestMe {
  user: { id: string; name: string; user_type: string; email: string | null }
  program: {
    id: string
    title: string
    code: string | null
    status: string
    start_date: string | null
    end_date: string | null
    host_organization: string | null
  }
  participation: { roles: string[]; joined_at: string | null }
  company: { name: string } | null
}

function applySession(data: SessionResponse): void {
  useGuestStore.getState().setSession(
    data.accessToken,
    {
      id: data.user.id,
      name: data.user.name,
      role: data.user.user_type,
    },
    data.program ?? null,
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

/**
 * 게스트 인증 서비스(커스텀 JWT).
 *
 * 로그인은 사업코드 + 이메일 + 비밀번호 세 값이 맞아야 성립한다. 비밀번호를 아직 정하지
 * 않았다면 세션 대신 설정 티켓이 오고, 새 비밀번호를 정해야 비로소 세션이 열린다.
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
   * 로그인. 세션이 열리면 null, 비밀번호를 정해야 하면 설정 티켓을 돌려준다.
   * 실패는 사유를 가리지 않는 한 문장으로 던진다(계정 열거 차단).
   */
  async login(creds: GuestCredentials): Promise<{ changeTicket: string } | null> {
    const { ok, data } = await post<LoginResponse>('guest-auth-login', creds)
    if (!ok) throw new Error(data?.message ?? '로그인에 실패했습니다.')

    if (data.mustChangePassword && data.changeTicket) {
      return { changeTicket: data.changeTicket }
    }
    if (!data.accessToken || !data.user) throw new Error('로그인에 실패했습니다.')
    applySession(data as SessionResponse)
    return null
  },

  /** 새 비밀번호 설정(최초 진입). 성공하면 그대로 세션이 열린다. */
  async setPassword(changeTicket: string, newPassword: string): Promise<void> {
    const { ok, data } = await post<SessionResponse & { message?: string }>(
      'guest-auth-password',
      { changeTicket, newPassword },
    )
    if (!ok) throw new Error(data?.message ?? '비밀번호 설정에 실패했습니다.')
    applySession(data)
  },

  /**
   * 세션 새로고침 — 원장의 현재 값(이름·사업 정보)을 되받아 저장한다.
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
      { id: data.program.id, title: data.program.title, code: data.program.code },
    )
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
