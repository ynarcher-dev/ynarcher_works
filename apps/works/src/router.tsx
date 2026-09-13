import { createBrowserRouter, Navigate } from 'react-router-dom'
import { RequireAuth } from '@/auth/RequireAuth'
import { RequireWorkspace } from '@/auth/RequireWorkspace'
import { LegacyRedirect } from '@/app/LegacyRedirect'
import { WorksLayout } from '@/app/WorksLayout'
import { AdminPage } from '@/features/admin/AdminPage'
import { BulkImportPage } from '@/features/bulk/BulkImportPage'
import { FUND_BULK_SPEC, STARTUP_BULK_SPEC } from '@/features/bulk/specs'
import { FundCreatePage } from '@/features/fund/FundCreatePage'
import { FundDetailPage } from '@/features/fund/FundDetailPage'
import { FundPage } from '@/features/fund/FundPage'
import { InvestmentDetailPage } from '@/features/fund/InvestmentDetailPage'
import { ManagementPage } from '@/features/management/ManagementPage'
import { EmployeeCreatePage } from '@/features/management/EmployeeCreatePage'
import { EmployeeDetailPage } from '@/features/management/EmployeeDetailPage'
import { MyPage } from '@/features/management/MyPage'
import { OrgReformPage } from '@/features/management/OrgReformPage'
import { OfficePage } from '@/features/office/OfficePage'
import { MyOfficePage } from '@/features/office/MyOfficePage'
import { MnaBulkPage, MnaProgramDetailPage, MnaWorkspacePage } from '@/features/mna/MnaWorkspace'
import { MaBuyerDetailPage, MaSellerDetailPage } from '@/features/mna/parties/MaPartyDetailPage'
import { MaBuyerPage, MaSellerPage } from '@/features/mna/parties/MaPartyPage'
import { NetworksPage } from '@/features/networks/NetworksPage'
import { NetworksBulkPage } from '@/features/networks/NetworksBulkPage'
import { NetworkDetailPage } from '@/features/networks/NetworkDetailPage'
import { LegacyNetworkRedirect } from '@/features/networks/LegacyNetworkRedirect'
import {
  ProjectBulkPage,
  ProjectProgramDetailPage,
  ProjectWorkspacePage,
} from '@/features/project/ProjectWorkspace'
import { StartupPage } from '@/features/startup/StartupPage'
import { StyleguidePage } from '@/features/styleguide/StyleguidePage'
import { StartupDetailPage } from '@/features/startup/StartupDetailPage'
import { StartupCreatePage } from '@/features/startup/StartupCreatePage'
import { LoginPage } from '@/pages/LoginPage'
import { RootLayout } from '@/pages/RootLayout'
import { GuestAccountsPage } from '@/features/guest/GuestAccountsPage'
import { GuestAccountsBulkPage } from '@/features/guest/GuestAccountsBulkPage'

/**
 * WORKS 앱 루트 라우터. 인증 셸(WorksLayout) 하위에 워크스페이스 라우트를 배치.
 *
 * **상세 경로의 모양은 하나다(2026-09-09 정리)** — 구획에 원장이 하나면 `구획/:id`,
 * 여럿이면 `구획/원장/:id`. 종전에는 같은 일을 하는 주소가 네 모양이었고(`/fund/:id` ·
 * `/ac/programs/:id` · `/startup/discovered/:id` · `/buyers/:id`), 가운데 명사 둘은 뜻을
 * 잃은 채였다. **가르지 않는 세그먼트는 주소를 길게 만들 뿐 아니라 거짓을 말한다** —
 * `discovered`는 구분마다 메뉴가 있던 시절의 이름이라 `/startup/discovered/:id`는 그
 * 기업이 발굴기업이라고 말하지만 투자기업도 그 주소로 열리고, `record`는 원장 통합의
 * 흔적일 뿐 아무것도 가르지 않았다.
 *
 * 옛 주소는 하나도 죽이지 않고 전부 `LegacyRedirect`가 받는다(쿼리·해시 보존). 밖에 나간
 * 링크와 북마크가 이 정리의 비용이 되어서는 안 된다.
 *
 * 정적 세그먼트(`bulk`·`new`)는 언제나 `:id` 라우트보다 **먼저** 놓는다 — 뒤에 놓으면
 * `/startup/new`가 id가 'new'인 기업을 찾는다.
 */
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
          // 기본 진입은 개인 업무의 출발점인 내 오피스.
          { index: true, element: <Navigate to="/my-office" replace /> },
          // 마이페이지(내 계정 관리): 모든 인증 사용자 접근(워크스페이스 권한 불요).
          { path: 'me', element: <MyPage /> },
          // GUEST 원장은 모든 내부 사용자의 생성·조회 진입점. 파일 업로드는 목록 버튼에서
          // 전용 페이지로 들어가며, 변경·삭제 권한은 RPC가 별도로 가른다.
          { path: 'guest-accounts/bulk', element: <GuestAccountsBulkPage /> },
          { path: 'guest-accounts', element: <GuestAccountsPage /> },

          // ── MY OFFICE ──────────────────────────────────────────────────
          // 메뉴 개편의 첫 단계에서는 기존 개인화 대시보드를 그대로 연결한다. 공용 OFFICE의
          // 기능과 주소는 건드리지 않고, 후속 개인 업무 기능이 붙을 독립 경로만 먼저 확보한다.
          {
            path: 'my-office',
            element: (
              <RequireWorkspace workspace="office">
                <MyOfficePage />
              </RequireWorkspace>
            ),
          },

          // ── NETWORKS ────────────────────────────────────────────────────
          {
            path: 'networks',
            element: (
              <RequireWorkspace workspace="networks">
                <NetworksPage />
              </RequireWorkspace>
            ),
          },
          // 대용량 업로드는 원장 목록의 버튼으로 진입하는 전용 페이지다(사이드바 메뉴 아님).
          {
            path: 'networks/bulk',
            element: (
              <RequireWorkspace workspace="networks">
                <NetworksBulkPage />
              </RequireWorkspace>
            ),
          },
          // 네트워크 상세. id='new'면 등록 모드(?category=로 초기 구분을 받는다).
          {
            path: 'networks/:id',
            element: (
              <RequireWorkspace workspace="networks">
                <NetworkDetailPage />
              </RequireWorkspace>
            ),
          },
          // 옛 경로(`/networks/record/:id` · `/networks/experts/:id` · `/networks/global/:id`
          // …)는 같은 레코드로 보낸다 — 이관이 id를 보존하므로 밖에 나간 링크가 죽지 않는다.
          // `record`도 `:entity`에 걸려 한 자리에서 처리된다.
          {
            path: 'networks/:entity/:id',
            element: (
              <RequireWorkspace workspace="networks">
                <LegacyNetworkRedirect />
              </RequireWorkspace>
            ),
          },

          // ── STARTUP ─────────────────────────────────────────────────────
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
          {
            path: 'startup/new',
            element: (
              <RequireWorkspace workspace="startup">
                <StartupCreatePage />
              </RequireWorkspace>
            ),
          },
          {
            path: 'startup/:id',
            element: (
              <RequireWorkspace workspace="startup">
                <StartupDetailPage />
              </RequireWorkspace>
            ),
          },
          // 옛 경로 — `discovered`는 구분별 메뉴가 있던 시절의 이름이다.
          { path: 'startup/discovered/new', element: <LegacyRedirect to="/startup/new" /> },
          {
            path: 'startup/discovered/:id',
            element: <LegacyRedirect to={(p) => `/startup/${p.id}`} />,
          },

          // ── PROJECT(구 AC) ──────────────────────────────────────────────
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
            path: 'project/:id',
            element: (
              <RequireWorkspace workspace="project">
                <ProjectProgramDetailPage />
              </RequireWorkspace>
            ),
          },
          // 옛 경로(2026-09-09 개명 이전). `/ac?tab=`으로 나간 딥링크가 살아야 하므로
          // 쿼리를 들고 간다.
          { path: 'ac', element: <LegacyRedirect to="/project" /> },
          { path: 'ac/bulk', element: <LegacyRedirect to="/project/bulk" /> },
          {
            path: 'ac/programs/:id',
            element: <LegacyRedirect to={(p) => `/project/${p.id}`} />,
          },

          // ── FUND ────────────────────────────────────────────────────────
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
          // 투자 집행 상세. 펀드에 매달린 건이라 주소도 그 밑에 선다 — 원장이 하나 더 늘어난
          // 것이 아니라 `/fund/:id`의 포트폴리오 한 줄을 펼친 자리다(`/fund/investments/:id`로
          // 두면 어느 펀드의 집행인지 주소가 답하지 못하고, 펀드명·목적 조회를 위해 레코드를
          // 먼저 읽어야 한다).
          {
            path: 'fund/:fundId/investments/:investmentId',
            element: (
              <RequireWorkspace workspace="fund">
                <InvestmentDetailPage />
              </RequireWorkspace>
            ),
          },

          // ── M&A·PE ──────────────────────────────────────────────────────
          // 원장이 셋(딜·BUYER·SELLER)이라 상세 경로가 원장 이름을 단다. 구획 판정이
          // 세그먼트 경계를 보게 된 뒤로(`resolveWorkspace`) 원장 둘도 제자리인 `/mna`
          // 아래에 선다 — 종전에는 `/mna/buyers`가 딜 구획에 앞머리로 먼저 걸려, 원장
          // 화면에 서 있는데 사이드바가 딜 줄을 칠하는 것을 피하려고 최상위에 있었다.
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
            path: 'mna/deals/:id',
            element: (
              <RequireWorkspace workspace="mna">
                <MnaProgramDetailPage />
              </RequireWorkspace>
            ),
          },
          {
            path: 'mna/buyers',
            element: (
              <RequireWorkspace workspace="mna">
                <MaBuyerPage />
              </RequireWorkspace>
            ),
          },
          {
            path: 'mna/buyers/:id',
            element: (
              <RequireWorkspace workspace="mna">
                <MaBuyerDetailPage />
              </RequireWorkspace>
            ),
          },
          {
            path: 'mna/sellers',
            element: (
              <RequireWorkspace workspace="mna">
                <MaSellerPage />
              </RequireWorkspace>
            ),
          },
          {
            path: 'mna/sellers/:id',
            element: (
              <RequireWorkspace workspace="mna">
                <MaSellerDetailPage />
              </RequireWorkspace>
            ),
          },
          // 옛 경로.
          {
            path: 'mna/programs/:id',
            element: <LegacyRedirect to={(p) => `/mna/deals/${p.id}`} />,
          },
          { path: 'buyers', element: <LegacyRedirect to="/mna/buyers" /> },
          { path: 'buyers/:id', element: <LegacyRedirect to={(p) => `/mna/buyers/${p.id}`} /> },
          { path: 'sellers', element: <LegacyRedirect to="/mna/sellers" /> },
          { path: 'sellers/:id', element: <LegacyRedirect to={(p) => `/mna/sellers/${p.id}`} /> },

          // ── ADMIN ───────────────────────────────────────────────────────
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

          // ── MANAGEMENT ──────────────────────────────────────────────────
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
          // 임직원 계정 생성 페이지(로그인 가능 계정).
          {
            path: 'management/hr/new',
            element: (
              <RequireWorkspace workspace="management">
                <EmployeeCreatePage />
              </RequireWorkspace>
            ),
          },
          // 임직원 상세. management 구획은 원장이 여럿이라 원장 이름(`hr`)을 단다.
          {
            path: 'management/hr/:id',
            element: (
              <RequireWorkspace workspace="management">
                <EmployeeDetailPage />
              </RequireWorkspace>
            ),
          },

          // ── OFFICE ──────────────────────────────────────────────────────
          {
            path: 'office',
            element: (
              <RequireWorkspace workspace="office">
                <OfficePage />
              </RequireWorkspace>
            ),
          },
          // 임직원 정보 상세. `/management/hr/:id`와 **같은 컴포넌트지만 같은 화면이 아니다** —
          // 읽기 전용이고 호봉을 숨기며, 권한도 office라 인사 권한이 없는 사람의 유일한
          // 경로다. 주소가 둘인 것은 중복이 아니라 노출이 둘이라는 뜻이다.
          {
            path: 'office/managers/:id',
            element: (
              <RequireWorkspace workspace="office">
                <EmployeeDetailPage readOnly showPayStep={false} backTo="/office?tab=managers" />
              </RequireWorkspace>
            ),
          },
          // 전자결재 워크스페이스는 OFFICE로 통합됨. 기존 링크·북마크는 OFFICE 전자결재 탭으로.
          {
            path: 'approval',
            element: <Navigate to="/my-office?tab=approval" replace />,
          },
        ],
      },
    ],
  },
])
