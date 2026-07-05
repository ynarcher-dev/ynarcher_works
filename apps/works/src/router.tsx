import { createBrowserRouter, Navigate } from 'react-router-dom'
import { RequireAuth } from '@/auth/RequireAuth'
import { RequireWorkspace } from '@/auth/RequireWorkspace'
import { WorksLayout } from '@/app/WorksLayout'
import { AcDashboardPage } from '@/features/ac/AcDashboardPage'
import { ProgramDetailPage } from '@/features/ac/ProgramDetailPage'
import { HubPage } from '@/features/hub/HubPage'
import { NetworksPage } from '@/features/networks/NetworksPage'
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
          {
            path: 'networks',
            element: (
              <RequireWorkspace workspace="networks">
                <NetworksPage />
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
        ],
      },
    ],
  },
])
