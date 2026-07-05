import { anonHeaders, functionsBase } from '@/lib/supabase'
import { useGuestStore, type GuestUser } from '@/auth/guestStore'

export interface GuestCredentials {
  name: string
  contact: string
  businessCode: string
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

/**
 * 게스트 인증 서비스(커스텀 JWT). OTP 발급/검증 Edge Function을 호출한다.
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
      const { accessToken, user } = JSON.parse(raw) as {
        accessToken: string
        user: GuestUser
      }
      if (jwtExp(accessToken) * 1000 < Date.now()) {
        useGuestStore.getState().reset()
        return
      }
      useGuestStore.getState().setSession(accessToken, user)
    } catch {
      useGuestStore.getState().reset()
    }
  },

  /** OTP 발송 요청(삼각 매핑). 열거 방지를 위해 결과는 항상 중립. */
  async requestOtp(creds: GuestCredentials): Promise<void> {
    await fetch(`${functionsBase}/guest-auth-request`, {
      method: 'POST',
      headers: anonHeaders,
      body: JSON.stringify(creds),
    })
  },

  /** OTP 검증 후 세션 수립. 실패 시 예외. */
  async verifyOtp(creds: GuestCredentials, otp: string): Promise<void> {
    const res = await fetch(`${functionsBase}/guest-auth-verify`, {
      method: 'POST',
      headers: anonHeaders,
      body: JSON.stringify({ ...creds, otp }),
    })
    if (!res.ok) throw new Error('auth_failed')
    const data = (await res.json()) as {
      accessToken: string
      user: { id: string; name: string; user_type: string }
    }
    useGuestStore.getState().setSession(data.accessToken, {
      id: data.user.id,
      name: data.user.name,
      role: data.user.user_type,
    })
  },

  signOut(): void {
    useGuestStore.getState().reset()
  },
}
