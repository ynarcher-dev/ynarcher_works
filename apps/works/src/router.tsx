import { createBrowserRouter, Navigate } from 'react-router-dom'
import { RequireAuth } from '@/auth/RequireAuth'
import { RequireWorkspace } from '@/auth/RequireWorkspace'
import { WorksLayout } from '@/app/WorksLayout'
import { AcBulkPage, AcProgramDetailPage, AcWorkspacePage } from '@/features/ac/AcWorkspace'
import { AdminPage } from '@/features/admin/AdminPage'
import { BulkImportPage } from '@/features/bulk/BulkImportPage'
import { FUND_BULK_SPEC, STARTUP_BULK_SPEC } from '@/features/bulk/specs'
import { FundCreatePage } from '@/features/fund/FundCreatePage'
import { FundDetailPage } from '@/features/fund/FundDetailPage'
import { FundPage } from '@/features/fund/FundPage'
import { ManagementPage } from '@/features/management/ManagementPage'
import { EmployeeCreatePage } from '@/features/management/EmployeeCreatePage'
import { EmployeeDetailPage } from '@/features/management/EmployeeDetailPage'
import { MyPage } from '@/features/management/MyPage'
import { OrgReformPage } from '@/features/management/OrgReformPage'
import { OfficePage } from '@/features/office/OfficePage'
import { MnaBulkPage, MnaProgramDetailPage, MnaWorkspacePage } from '@/features/mna/MnaWorkspace'
import { NetworksPage } from '@/features/networks/NetworksPage'
import { NetworksBulkPage } from '@/features/networks/NetworksBulkPage'
import { NetworkDetailPage } from '@/features/networks/NetworkDetailPage'
import { LegacyNetworkRedirect } from '@/features/networks/LegacyNetworkRedirect'
import { StartupPage } from '@/features/startup/StartupPage'
import { StyleguidePage } from '@/features/styleguide/StyleguidePage'
import { StartupDetailPage } from '@/features/startup/StartupDetailPage'
import { StartupCreatePage } from '@/features/startup/StartupCreatePage'
import {
  ProjectBulkPage,
  ProjectProgramDetailPage,
  ProjectWorkspacePage,
} from '@/features/project/ProjectWorkspace'
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
          // HUB 워크스페이스 제거됨 → 기본 진입은 OFFICE(전사 대시보드).
          { index: true, element: <Navigate to="/office" replace /> },
          // 마이페이지(내 계정 관리): 모든 인증 사용자 접근(워크스페이스 권한 불요).
          { path: 'me', element: <MyPage /> },
          {
            path: 'networks',
            element: (
              <RequireWorkspace workspace="networks">
                <NetworksPage />
              </RequireWorkspace>
            ),
          },
          // 대용량 업로드는 원장 목록의 버튼으로 진입하는 전용 페이지다(사이드바 메뉴 아님).
          // 정적 세그먼트라 아래 `networks/:entity/:id` 라우트보다 먼저 놓는다.
          {
            path: 'networks/bulk',
            element: (
              <RequireWorkspace workspace="networks">
                <NetworksBulkPage />
              </RequireWorkspace>
            ),
          },
          // 네트워크 상세페이지. id='new'면 등록 모드(?category=로 초기 구분을 받는다).
          // 원장이 하나가 되면서 경로도 하나다(2026-09-04 통합).
          {
            path: 'networks/record/:id',
            element: (
              <RequireWorkspace workspace="networks">
                <NetworkDetailPage />
              </RequireWorkspace>
            ),
          },
          // 옛 경로(/networks/experts/:id · /networks/global/:id …)는 같은 레코드로 보낸다 —
          // 이관이 id를 보존하므로 밖에 나간 링크·알림이 죽지 않는다.
          {
            path: 'networks/:entity/:id',
            element: (
              <RequireWorkspace workspace="networks">
                <LegacyNetworkRedirect />
              </RequireWorkspace>
            ),
          },
          {
            path: 'startup',
            element: (
              <RequireWorkspace workspace="startup">
                <StartupPage />
              </RequireWorkspace>
            ),
          },
          {
            path: 'startup/bulk',
            element: (
              <RequireWorkspace workspace="startup">
                <BulkImportPage spec={STARTUP_BULK_SPEC} />
              </RequireWorkspace>
            ),
          },
          // 스타트업 신규 등록 페이지(모달 아님). 정적 세그먼트라 아래 :id 라우트보다 우선 매칭된다.
          {
            path: 'startup/discovered/new',
            element: (
              <RequireWorkspace workspace="startup">
                <StartupCreatePage />
              </RequireWorkspace>
            ),
          },
          // 스타트업 풀 상세페이지(모달 아님, 카드 섹션). 발굴기업 목록 행 클릭으로 진입한다.
          {
            path: 'startup/discovered/:id',
            element: (
              <RequireWorkspace workspace="startup">
                <StartupDetailPage />
              </RequireWorkspace>
            ),
          },
          {
            path: 'ac',
            element: (
              <RequireWorkspace workspace="ac">
                <AcWorkspacePage />
              </RequireWorkspace>
            ),
          },
          {
            path: 'ac/bulk',
            element: (
              <RequireWorkspace workspace="ac">
                <AcBulkPage />
              </RequireWorkspace>
            ),
          },
          {
            path: 'ac/programs/:id',
            element: (
              <RequireWorkspace workspace="ac">
                <AcProgramDetailPage />
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
            path: 'fund/new',
            element: (
              <RequireWorkspace workspace="fund">
                <FundCreatePage />
              </RequireWorkspace>
            ),
          },
          {
            path: 'fund/bulk',
            element: (
              <RequireWorkspace workspace="fund">
                <BulkImportPage spec={FUND_BULK_SPEC} />
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
                <MnaWorkspacePage />
              </RequireWorkspace>
            ),
          },
          {
            path: 'mna/bulk',
            element: (
              <RequireWorkspace workspace="mna">
                <MnaBulkPage />
              </RequireWorkspace>
            ),
          },
          {
            path: 'mna/programs/:id',
            element: (
              <RequireWorkspace workspace="mna">
                <MnaProgramDetailPage />
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
          // 디자인 시스템 규격 확인용 내부 페이지. 메뉴에는 노출하지 않고 URL로만 진입한다.
          { path: 'styleguide', element: <StyleguidePage /> },
          {
            path: 'project',
            element: (
              <RequireWorkspace workspace="project">
                <ProjectWorkspacePage />
              </RequireWorkspace>
            ),
          },
          {
            path: 'project/bulk',
            element: (
              <RequireWorkspace workspace="project">
                <ProjectBulkPage />
              </RequireWorkspace>
            ),
          },
          {
            path: 'project/programs/:id',
            element: (
              <RequireWorkspace workspace="project">
                <ProjectProgramDetailPage />
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
          // 조직 개편 설계 페이지. 초안(DRAFT) 버전이 서버에 남으므로 나갔다 돌아와도 이어서 편집한다.
          {
            path: 'management/org-reform',
            element: (
              <RequireWorkspace workspace="management">
                <OrgReformPage />
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
          // 임직원 정보 상세(조회 전용). OFFICE 임직원 정보 목록(조직 트리)의 인물 카드 클릭으로 진입한다.
          {
            path: 'office/managers/:id',
            element: (
              <RequireWorkspace workspace="office">
                <EmployeeDetailPage readOnly showPayStep={false} backTo="/office?tab=managers" />
              </RequireWorkspace>
            ),
          },
          // 전자결재 워크스페이스는 OFFICE로 통합됨. 기존 링크·북마크는 OFFICE 전자결재 탭으로 리다이렉트.
          {
            path: 'approval',
            element: <Navigate to="/office?tab=approval" replace />,
          },
        ],
      },
    ],
  },
])
