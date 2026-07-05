import { Outlet } from 'react-router-dom'
import { GuestAuthProvider } from '@/auth/GuestAuthProvider'

/** 루트 레이아웃: 게스트 세션 복원(GuestAuthProvider) 하위에 아웃렛 배치. */
export function RootLayout() {
  return (
    <GuestAuthProvider>
      <Outlet />
    </GuestAuthProvider>
  )
}
