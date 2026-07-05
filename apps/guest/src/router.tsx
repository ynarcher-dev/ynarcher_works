import { createBrowserRouter } from 'react-router-dom'
import { RequireGuestAuth } from '@/auth/RequireGuestAuth'
import { GuestHomePage } from '@/pages/GuestHomePage'
import { GuestLoginPage } from '@/pages/GuestLoginPage'
import { RootLayout } from '@/pages/RootLayout'

/** GUEST 앱 루트 라우터 (OTP/커스텀 JWT 인증 가드). */
export const router = createBrowserRouter([
  {
    element: <RootLayout />,
    children: [
      { path: '/login', element: <GuestLoginPage /> },
      {
        path: '/',
        element: (
          <RequireGuestAuth>
            <GuestHomePage />
          </RequireGuestAuth>
        ),
      },
    ],
  },
])
