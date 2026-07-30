import { Outlet, ScrollRestoration } from 'react-router-dom'
import { AuthProvider } from '@/auth/AuthProvider'

/**
 * 루트 레이아웃: 세션 부트스트랩(AuthProvider) 하위에 라우트 아웃렛을 배치.
 *
 * SPA는 이동해도 스크롤 위치가 그대로 남는다 — 긴 목록을 한참 내려가 상세로 들어가면
 * 상세 페이지가 중간부터 보인다. ScrollRestoration으로 브라우저 기본 동작을 되살려,
 * 새 이동(PUSH)은 맨 위에서 시작하고 뒤로가기(POP)는 목록의 보던 자리로 되돌린다.
 */
export function RootLayout() {
  return (
    <AuthProvider>
      <ScrollRestoration />
      <Outlet />
    </AuthProvider>
  )
}
