import { Navigate, createBrowserRouter } from 'react-router-dom'
import { GuestLayout } from '@/app/GuestLayout'
import { RequireGuestAuth } from '@/auth/RequireGuestAuth'
import { useGuestStore } from '@/auth/guestStore'
import { defaultView, homePathOf } from '@/config/navigation'
import { ApplyPage } from '@/pages/ApplyPage'
import { BookingPage } from '@/pages/BookingPage'
import { GuestLoginPage } from '@/pages/GuestLoginPage'
import { MentorFeedbackPage } from '@/pages/MentorFeedbackPage'
import { RootLayout } from '@/pages/RootLayout'
import { SatisfactionPage } from '@/pages/SatisfactionPage'
import { SchedulePage } from '@/pages/SchedulePage'
import { SessionBoardPage } from '@/pages/SessionBoardPage'
import { TempGuestPage } from '@/pages/TempGuestPage'

/** 루트(`/`) 착지점: 계정 역할이 정하는 기본 뷰의 첫 메뉴로 보낸다. */
function GuestEntry() {
  const role = useGuestStore((s) => s.user?.role)
  return <Navigate to={homePathOf(defaultView(role))} replace />
}

/**
 * GUEST 앱 루트 라우터.
 *
 * 셸(`GuestLayout`)은 **인증된 업무 화면에만** 씌운다. 로그인은 아직 사업이 정해지기 전이라
 * 사이드바에 채울 것이 없고, 임시 게스트 뷰(`/g/:token`)는 내비게이션 요소를 전혀 렌더링하지
 * 않는 것이 기획 요건이며(3_9_workspace_guest.md §1.3), 공개 모집(`/apply/:token`)은 로그인
 * 이전의 외부 랜딩이다. 세 진입점 모두 셸 밖에 남는다.
 */
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
        element: (
          <RequireGuestAuth>
            <GuestLayout />
          </RequireGuestAuth>
        ),
        children: [
          { path: '/', element: <GuestEntry /> },
          // 스타트업 뷰
          { path: '/schedule', element: <SchedulePage /> },
          { path: '/booking', element: <BookingPage /> },
          { path: '/satisfaction', element: <SatisfactionPage /> },
          // 전문가 뷰
          { path: '/sessions', element: <SessionBoardPage /> },
          { path: '/feedback', element: <MentorFeedbackPage /> },
        ],
      },
    ],
  },
])
