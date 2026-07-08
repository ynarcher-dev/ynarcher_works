import { createBrowserRouter, Navigate } from 'react-router-dom'
import { RequireAuth } from '@/auth/RequireAuth'
import { RequireWorkspace } from '@/auth/RequireWorkspace'
import { WorksLayout } from '@/app/WorksLayout'
import { AcDashboardPage } from '@/features/ac/AcDashboardPage'
import { AdminPage } from '@/features/admin/AdminPage'
import { ProgramDetailPage } from '@/features/ac/ProgramDetailPage'
import { FundDetailPage } from '@/features/fund/FundDetailPage'
import { FundPage } from '@/features/fund/FundPage'
import { HubPage } from '@/features/hub/HubPage'
import { ManagementPage } from '@/features/management/ManagementPage'
import { EmployeeCreatePage } from '@/features/management/EmployeeCreatePage'
import { EmployeeDetailPage } from '@/features/management/EmployeeDetailPage'
import { MyPage } from '@/features/management/MyPage'
import { OfficePage } from '@/features/office/OfficePage'
import { ApprovalPage } from '@/features/approval/ApprovalPage'
import { MnaDealDetailPage } from '@/features/mna/MnaDealDetailPage'
import { MnaPage } from '@/features/mna/MnaPage'
import { NetworksPage } from '@/features/networks/NetworksPage'
import { NetworkDetailPage } from '@/features/networks/NetworkDetailPage'
import { GlobalNetworkDetailPage } from '@/features/networks/GlobalNetworkDetailPage'
import { DIRECTORY_ENTITIES, HUB_DETAIL_ENTITIES } from '@/features/networks/config'
import { StartupPage } from '@/features/startup/StartupPage'
import { ProjectDetailPage } from '@/features/project/ProjectDetailPage'
import { ProjectPage } from '@/features/project/ProjectPage'
import { LoginPage } from '@/pages/LoginPage'
import { RootLayout } from '@/pages/RootLayout'

/** WORKS 앱 루트 라우터. 인증 셸(WorksLayout) 하위에 워크스페이스 라우트를 배치. */
export const router = createBrowserRouter([
  {
    element: <RootLayout />,
    children: [
      { path: '/login', element: <LoginPage /> },
      {
        element: (
          <RequireAuth>
            <WorksLayout />
          </RequireAuth>
        ),
        children: [
          { index: true, element: <Navigate to="/hub" replace /> },
          // 마이페이지(내 계정 관리): 모든 인증 사용자 접근(워크스페이스 권한 불요).
          { path: 'me', element: <MyPage /> },
          {
            path: 'hub',
            element: (
              <RequireWorkspace workspace="hub">
                <HubPage />
              </RequireWorkspace>
            ),
          },
          // HUB 조회 센터 내 프로필 상세(읽기 전용). NETWORKS로 이탈하지 않고 HUB에 머문다.
          ...HUB_DETAIL_ENTITIES.map((entity) => ({
            path: `hub/${entity}/:id`,
            element: (
              <RequireWorkspace workspace="hub">
                <NetworkDetailPage
                  entity={entity}
                  readOnly
                  listPath="/hub?tab=experts"
                  backLabel="투자/전문가 네트워크"
                />
              </RequireWorkspace>
            ),
          })),
          {
            path: 'networks',
            element: (
              <RequireWorkspace workspace="networks">
                <NetworksPage />
              </RequireWorkspace>
            ),
          },
          // 글로벌 네트워크 상세페이지(독립 마스터). id='new'면 등록 모드.
          {
            path: 'networks/global/:id',
            element: (
              <RequireWorkspace workspace="networks">
                <GlobalNetworkDetailPage />
              </RequireWorkspace>
            ),
          },
          // 네트워크 상세페이지(공용 NetworkDetailPage). 카테고리 + 미분류 데이터베이스(others).
          ...DIRECTORY_ENTITIES.map((entity) => ({
            path: `networks/${entity}/:id`,
            element: (
              <RequireWorkspace workspace="networks">
                <NetworkDetailPage entity={entity} />
              </RequireWorkspace>
            ),
          })),
          {
            path: 'startup',
            element: (
              <RequireWorkspace workspace="startup">
                <StartupPage />
              </RequireWorkspace>
            ),
          },
          {
            path: 'ac',
            element: (
              <RequireWorkspace workspace="ac">
                <AcDashboardPage />
              </RequireWorkspace>
            ),
          },
          {
            path: 'ac/programs/:id',
            element: (
              <RequireWorkspace workspace="ac">
                <ProgramDetailPage />
              </RequireWorkspace>
            ),
          },
          {
            path: 'fund',
            element: (
              <RequireWorkspace workspace="fund">
                <FundPage />
              </RequireWorkspace>
            ),
          },
          {
            path: 'fund/:id',
            element: (
              <RequireWorkspace workspace="fund">
                <FundDetailPage />
              </RequireWorkspace>
            ),
          },
          {
            path: 'mna',
            element: (
              <RequireWorkspace workspace="mna">
                <MnaPage />
              </RequireWorkspace>
            ),
          },
          {
            path: 'mna/:id',
            element: (
              <RequireWorkspace workspace="mna">
                <MnaDealDetailPage />
              </RequireWorkspace>
            ),
          },
          {
            path: 'admin',
            element: (
              <RequireWorkspace workspace="admin">
                <AdminPage />
              </RequireWorkspace>
            ),
          },
          {
            path: 'project',
            element: (
              <RequireWorkspace workspace="project">
                <ProjectPage />
              </RequireWorkspace>
            ),
          },
          {
            path: 'project/:id',
            element: (
              <RequireWorkspace workspace="project">
                <ProjectDetailPage />
              </RequireWorkspace>
            ),
          },
          {
            path: 'management',
            element: (
              <RequireWorkspace workspace="management">
                <ManagementPage />
              </RequireWorkspace>
            ),
          },
          // 임직원 계정 생성 페이지(로그인 가능 계정). :id 라우트보다 정적 경로가 우선한다.
          {
            path: 'management/hr/new',
            element: (
              <RequireWorkspace workspace="management">
                <EmployeeCreatePage />
              </RequireWorkspace>
            ),
          },
          // 임직원 상세페이지(조회 전용). 인사 관리 리스트 행 클릭으로 진입한다.
          {
            path: 'management/hr/:id',
            element: (
              <RequireWorkspace workspace="management">
                <EmployeeDetailPage />
              </RequireWorkspace>
            ),
          },
          {
            path: 'office',
            element: (
              <RequireWorkspace workspace="office">
                <OfficePage />
              </RequireWorkspace>
            ),
          },
          // 임직원 정보 상세(조회 전용). OFFICE 임직원 정보 목록 행 클릭으로 진입한다.
          {
            path: 'office/managers/:id',
            element: (
              <RequireWorkspace workspace="office">
                <EmployeeDetailPage
                  readOnly
                  backTo="/office?tab=managers"
                  backLabel="임직원 정보"
                />
              </RequireWorkspace>
            ),
          },
          {
            path: 'approval',
            element: (
              <RequireWorkspace workspace="approval">
                <ApprovalPage />
              </RequireWorkspace>
            ),
          },
        ],
      },
    ],
  },
])
