import { useEffect, type ReactNode } from 'react'
import { guestAuth } from '@/auth/guestAuthService'
import { useGuestStore } from '@/auth/guestStore'

/**
 * 앱 구동 시 localStorage 게스트 세션 복원 + 백그라운드 새로고침.
 *
 * 복원만 하면 화면은 로그인 시점의 복사본(이름·사업명)으로 열린다. 복원 직후 원장 값을
 * 되받아 조용히 바로잡는다 — 실패(네트워크 등)해도 세션은 유지한다. 접근이 닫힌 경우(401)는
 * refreshSession이 스스로 로그아웃시킨다.
 */
export function GuestAuthProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    guestAuth.restore()
    if (useGuestStore.getState().status === 'authenticated') {
      void guestAuth.refreshSession().catch(() => {})
    }
  }, [])
  return <>{children}</>
}
