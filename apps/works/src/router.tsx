import { createBrowserRouter } from 'react-router-dom'
import { RequireAuth } from '@/auth/RequireAuth'
import { HomePage } from '@/pages/HomePage'
import { LoginPage } from '@/pages/LoginPage'
import { RootLayout } from '@/pages/RootLayout'

/**
 * WORKS 앱 루트 라우터.
 * 워크스페이스별 라우트/가드(RequireWorkspace)는 이후 단계에서 확장한다.
 */
export const router = createBrowserRouter([
  {
    element: <RootLayout />,
    children: [
      { path: '/login', element: <LoginPage /> },
      {
        path: '/',
        element: (
          <RequireAuth>
            <HomePage />
          </RequireAuth>
        ),
      },
    ],
  },
])
