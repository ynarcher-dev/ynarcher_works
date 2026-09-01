import { EmptyState, Spinner } from '@ynarcher/ui'
import { Navigate, createBrowserRouter } from 'react-router-dom'
import { GuestLayout } from '@/app/GuestLayout'
import { RequireGuestAuth } from '@/auth/RequireGuestAuth'
import { useGuestStore } from '@/auth/guestStore'
import { defaultView, homePathOf } from '@/config/navigation'
import { useGuestModules } from '@/features/moduleHooks'
import { ApplyPage } from '@/pages/ApplyPage'
import { GuestLoginPage } from '@/pages/GuestLoginPage'
import { MentorFeedbackPage } from '@/pages/MentorFeedbackPage'
import { ModulePage } from '@/pages/ModulePage'
import { MyPage } from '@/pages/MyPage'
import { RootLayout } from '@/pages/RootLayout'
import { SessionBoardPage } from '@/pages/SessionBoardPage'
import { TempGuestPage } from '@/pages/TempGuestPage'

/**
 * 루트(`/`) 착지점: 계정 역할이 정하는 기본 뷰의 첫 메뉴로 보낸다.
 *
 * 스타트업 뷰의 첫 메뉴는 WORKS에서 공개로 올린 첫 모듈이므로 조회를 기다려야 하고, 공개된
 * 것이 하나도 없을 수 있다. 그때 리다이렉트할 곳이 없다는 사실을 빈 화면으로 흘리지 않고
 * 여기서 말한다 — 로그인은 됐는데 아무 데도 못 가는 상태가 게스트에게는 가장 알기 어렵다.
 */
function GuestEntry() {
  const role = useGuestStore((s) => s.user?.role)
  const { data: modules, isLoading } = useGuestModules()

  if (isLoading) return <Spinner />

  const home = homePathOf(defaultView(role), modules ?? [])
  if (home) return <Navigate to={home} replace />

  return (
    <EmptyState
      title="아직 열린 메뉴가 없습니다"
      description="담당자가 사업 메뉴를 공개하면 이 자리에 나타납니다. 잠시 후 다시 확인해 주십시오."
    />
  )
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
          // 스타트업 뷰 — 화면 하나가 공개 메뉴(모듈) 하나에 대응한다. 경로가 코드에 고정된
          // 메뉴는 더 이상 없다(3_9_workspace_guest.md §1.1).
          { path: '/m/:moduleId', element: <ModulePage /> },
          // 전문가 뷰
          { path: '/sessions', element: <SessionBoardPage /> },
          { path: '/feedback', element: <MentorFeedbackPage /> },
          // 개인 메뉴(상단바 드롭다운)에서 들어오는 화면 — 사이드바 메뉴에는 서지 않는다.
          { path: '/me', element: <MyPage /> },
        ],
      },
    ],
  },
])
