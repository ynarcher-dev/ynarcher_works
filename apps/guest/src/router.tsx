import { createBrowserRouter } from 'react-router-dom'
import { App } from '@/App'

/**
 * GUEST 앱 루트 라우터.
 * 게스트 OTP/매직링크 인증 가드와 대시보드 라우트는 Phase 3·Phase 13에서 확장합니다.
 */
export const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
  },
])
