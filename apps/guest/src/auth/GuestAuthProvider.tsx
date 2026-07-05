import { useEffect, type ReactNode } from 'react'
import { guestAuth } from '@/auth/guestAuthService'

/** 앱 구동 시 localStorage 게스트 세션 복원. */
export function GuestAuthProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    guestAuth.restore()
  }, [])
  return <>{children}</>
}
