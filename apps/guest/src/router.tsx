import { createBrowserRouter } from 'react-router-dom'
import { RequireGuestAuth } from '@/auth/RequireGuestAuth'
import { ApplyPage } from '@/pages/ApplyPage'
import { GuestHomePage } from '@/pages/GuestHomePage'
import { GuestLoginPage } from '@/pages/GuestLoginPage'
import { RootLayout } from '@/pages/RootLayout'
import { TempGuestPage } from '@/pages/TempGuestPage'

/** GUEST 앱 루트 라우터 (OTP/커스텀 JWT 인증 가드 + 임시 게스트 일회성 링크). */
export const router = createBrowserRouter([
  // 공개 모집 신청 랜딩: 인증 가드 없이 배포 URL 토큰만으로 렌더링/접수.
  { path: '/apply/:token', element: <ApplyPage /> },
  // 임시 게스트 뷰: 인증 가드 없이 일회성 토큰만으로 격리 렌더링.
  { path: '/g/:token', element: <TempGuestPage /> },
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
