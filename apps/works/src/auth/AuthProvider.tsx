import { useEffect, type ReactNode } from 'react'
import { employeeAuth } from '@/auth/employeeAuthService'

/** 앱 구동 시 최초 1회 세션 부트스트랩. */
export function AuthProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    void employeeAuth.init()
  }, [])
  return <>{children}</>
}
