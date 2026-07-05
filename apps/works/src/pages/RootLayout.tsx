import { Outlet } from 'react-router-dom'
import { AuthProvider } from '@/auth/AuthProvider'

/** 루트 레이아웃: 세션 부트스트랩(AuthProvider) 하위에 라우트 아웃렛을 배치. */
export function RootLayout() {
  return (
    <AuthProvider>
      <Outlet />
    </AuthProvider>
  )
}
