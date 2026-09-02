import { Navigate, createBrowserRouter } from 'react-router-dom'
import { GuestLayout } from '@/app/GuestLayout'
import { RequireGuestAuth } from '@/auth/RequireGuestAuth'
import { GUEST_HOME_PATH } from '@/config/navigation'
import { AnnouncementsPage } from '@/pages/AnnouncementsPage'
import { ApplyPage } from '@/pages/ApplyPage'
import { GuestLoginPage } from '@/pages/GuestLoginPage'
import { QnaPage } from '@/pages/QnaPage'
import { ModulePage } from '@/pages/ModulePage'
import { MyPage } from '@/pages/MyPage'
import { OverviewPage } from '@/pages/OverviewPage'
import { PublicModulePage } from '@/pages/PublicModulePage'
import { RootLayout } from '@/pages/RootLayout'
import { SchedulePage } from '@/pages/SchedulePage'
import { TempGuestPage } from '@/pages/TempGuestPage'

/**
 * 루트(`/`) 착지점: 언제나 사업개요다(고정 메뉴).
 *
 * 종전에는 계정 역할이 뷰(스타트업/전문가)를 갈랐으나 2026-09-03에 전문가 뷰가 걷혔고,
 * 그보다 앞서 첫 공개 모듈을 기다렸다가 없으면 '열린 메뉴가 없다'를 말하던 분기도
 * 사라졌다. 공개 메뉴가 없어도 사업소개는 있다.
 */
function GuestEntry() {
  return <Navigate to={GUEST_HOME_PATH} replace />
}

/**
 * GUEST 앱 루트 라우터.
 *
 * 셸(`GuestLayout`)은 **인증된 업무 화면에만** 씌운다. 로그인은 아직 사업이 정해지기 전이라
 * 사이드바에 채울 것이 없고, 임시 게스트 뷰(`/g/:token`)는 내비게이션 요소를 전혀 렌더링하지
 * 않는 것이 기획 요건이며(3_9_workspace_guest.md §1.3), 공개 모집(`/apply/:token`)은 로그인
 * 이전의 외부 랜딩이며, 모듈 공개 링크(`/p/:token`)는 메뉴 하나만 여는 격리 뷰다.
 * 네 진입점 모두 셸 밖에 남는다.
 */
export const router = createBrowserRouter([
  // 공개 모집 신청 랜딩: 인증 가드 없이 배포 URL 토큰만으로 렌더링/접수.
  { path: '/apply/:token', element: <ApplyPage /> },
  // 임시 게스트 뷰: 인증 가드 없이 일회성 토큰만으로 격리 렌더링.
  { path: '/g/:token', element: <TempGuestPage /> },
  // 모듈 공개 링크: 인증 가드 없이 토큰만으로 **모듈 하나만** 격리 렌더링.
  // 여기 들어온 사람은 게스트가 아니다 — 세션도 사업 고정 코드도 없고 셸도 씌우지 않는다.
  { path: '/p/:token', element: <PublicModulePage /> },
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
          // 스타트업 뷰 — 상단 고정 메뉴 4종(사업개요는 로그인 직후 첫 화면).
          { path: '/overview', element: <OverviewPage /> },
          { path: '/announcements', element: <AnnouncementsPage /> },
          { path: '/schedule', element: <SchedulePage /> },
          { path: '/qna', element: <QnaPage /> },
          // 그 아래는 화면 하나가 공개 메뉴(모듈) 하나에 대응한다. 경로가 코드에 고정된
          // 모듈 메뉴는 없다(3_9_workspace_guest.md §1.1).
          { path: '/m/:moduleId', element: <ModulePage /> },
          // 개인 메뉴(상단바 드롭다운)에서 들어오는 화면 — 사이드바 메뉴에는 서지 않는다.
          { path: '/me', element: <MyPage /> },
        ],
      },
    ],
  },
])
