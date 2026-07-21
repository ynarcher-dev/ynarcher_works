import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useGuestStore } from '@/auth/guestStore'

/** 게스트 인증 가드: 미인증 시 로그인 화면으로 이동. */
export function RequireGuestAuth({ children }: { children: ReactNode }) {
  const status = useGuestStore((s) => s.status)
  if (status === 'loading') {
    return <div className="p-6 text-body text-gray-600">불러오는 중…</div>
  }
  if (status === 'unauthenticated') {
    return <Navigate to="/login" replace />
  }
  return <>{children}</>
}
