import { Outlet, ScrollRestoration } from 'react-router-dom'
import { GuestAuthProvider } from '@/auth/GuestAuthProvider'

/**
 * 루트 레이아웃: 게스트 세션 복원(GuestAuthProvider) 하위에 아웃렛 배치.
 *
 * 메뉴가 여럿이 된 이상 works와 같은 이유로 스크롤 복원이 필요하다 — SPA는 이동해도 스크롤이
 * 그대로 남아, 긴 목록을 내려간 뒤 다른 메뉴로 옮기면 그 화면이 중간부터 보인다.
 */
export function RootLayout() {
  return (
    <GuestAuthProvider>
      <ScrollRestoration />
      <Outlet />
    </GuestAuthProvider>
  )
}
