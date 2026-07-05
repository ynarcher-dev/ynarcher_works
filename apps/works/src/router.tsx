import { createBrowserRouter } from 'react-router-dom'
import { App } from '@/App'

/**
 * WORKS 앱 루트 라우터.
 * 역할 기반 라우팅 가드와 워크스페이스별 라우트는 Phase 3(인증)·이후 단계에서 확장합니다.
 */
export const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
  },
])
