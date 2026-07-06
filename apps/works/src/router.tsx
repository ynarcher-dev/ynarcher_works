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
import { MnaDealDetailPage } from '@/features/mna/MnaDealDetailPage'
import { MnaPage } from '@/features/mna/MnaPage'
import { NetworksPage } from '@/features/networks/NetworksPage'
import { ProfileDetailPage } from '@/features/networks/ProfileDetailPage'
import { EntityDetailPage } from '@/features/networks/EntityDetailPage'
import { ORG_ENTITIES } from '@/features/networks/config'
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
          {
            path: 'hub',
            element: (
              <RequireWorkspace workspace="hub">
                <HubPage />
              </RequireWorkspace>
            ),
          },
          // HUB 조회 센터 내 프로필 상세(읽기 전용). NETWORKS로 이탈하지 않고 HUB에 머문다.
          ...(['experts', 'van', 'investors'] as const).map((entity) => ({
            path: `hub/${entity}/:id`,
            element: (
              <RequireWorkspace workspace="hub">
                <ProfileDetailPage
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
          {
            path: 'networks/experts/:id',
            element: (
              <RequireWorkspace workspace="networks">
                <ProfileDetailPage entity="experts" />
              </RequireWorkspace>
            ),
          },
          {
            path: 'networks/van/:id',
            element: (
              <RequireWorkspace workspace="networks">
                <ProfileDetailPage entity="van" />
              </RequireWorkspace>
            ),
          },
          {
            path: 'networks/investors/:id',
            element: (
              <RequireWorkspace workspace="networks">
                <ProfileDetailPage entity="investors" />
              </RequireWorkspace>
            ),
          },
          // 조직 마스터(기업·기관·대학·외주/거래·미분류) 상세페이지(공용 EntityDetailPage).
          ...ORG_ENTITIES.map((entity) => ({
            path: `networks/${entity}/:id`,
            element: (
              <RequireWorkspace workspace="networks">
                <EntityDetailPage entity={entity} />
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
        ],
      },
    ],
  },
])
