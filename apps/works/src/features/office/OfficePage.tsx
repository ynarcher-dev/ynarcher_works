import { PageHeader } from '@ynarcher/ui'
import { Navigate, useSearchParams } from 'react-router-dom'
import { useAuthStore } from '@/auth/authStore'
import { ApprovalTable } from '@/features/approval/ApprovalTable'
import { ArchiveWorkspace } from '@/features/hub/ArchiveWorkspace'
import { BoardWorkspace } from '@/features/hub/BoardWorkspace'
import { DashboardPanel } from '@/features/hub/DashboardPanel'
import { NoticeWorkspace } from '@/features/hub/NoticeWorkspace'
import { NOTICE_TAB } from '@/features/hub/boardPostStore'
import { useBoards } from '@/features/hub/boardHooks'
import { DepartmentsPanel } from '@/features/management/panels/DepartmentsPanel'
import { OfficeManagersPanel } from '@/features/office/OfficeManagersPanel'

/** 페이지 골격만 있는 준비 중 메뉴(탭 → 제목). */
const PLACEHOLDER_TITLES: Record<string, string> = {
  rooms: '회의실 예약',
  // 거래처 정보: 전자결재 워크스페이스에서 이관, 세부 기능은 후속 작업(골격만).
  clients: '거래처 정보',
  // 지사 정보: 원장 화면인 MANAGEMENT '지사 관리'가 아직 준비 중이라 함께 골격만 노출한다.
  branches: '지사 정보',
}

/**
 * OFFICE 워크스페이스: 대시보드 + 임직원 정보·회의실 예약 + 전자결재·거래처 정보 + 게시판 홈.
 * 좌측 사이드바(?tab)로 섹션을 전환하며, 신규 게시판(ADMIN 게시판 관리 생성)이 모두 이곳에
 * 노출된다. AI 에이전트·전사 캘린더는 상단바 전역 진입점(우측 슬라이드오버)에서 연다.
 */
export function OfficePage() {
  const [params] = useSearchParams()
  const userName = useAuthStore((s) => s.user?.name)
  const boards = useBoards().data ?? []

  const tab = params.get('tab')

  // 탭 미지정 시 최상단 대시보드로 정규화(사이드바 활성 상태와 URL 동기화).
  if (!tab) return <Navigate to="/office?tab=dashboard" replace />

  // 공지사항은 게시판이 아니라 전체 공지 게시글을 모아 보여주는 뷰다(레지스트리와 무관).
  if (tab === NOTICE_TAB) {
    return (
      <div className="flex h-full flex-col">
        <NoticeWorkspace />
      </div>
    )
  }

  // 게시 탭은 종류에 따라 화면이 갈린다.
  // 게시판(POST)=상세페이지가 있는 BoardWorkspace / 자료실(ARCHIVE)=즉시 다운로드 목록.
  const board = boards.find((b) => b.slug === tab && b.isActive)
  if (board) {
    return (
      <div className="flex h-full flex-col">
        {board.kind === 'ARCHIVE' ? (
          <ArchiveWorkspace
            key={board.slug}
            boardSlug={board.slug}
            title={board.label}
            authorName={userName}
          />
        ) : (
          <BoardWorkspace
            key={board.slug}
            boardSlug={board.slug}
            title={board.label}
            authorName={userName}
            initialPostId={params.get('post') ?? undefined}
          />
        )}
      </div>
    )
  }

  // 준비 중 메뉴(페이지 골격만). 세부 기능은 후속 작업.
  const placeholder = PLACEHOLDER_TITLES[tab]
  if (placeholder) {
    return (
      <div className="space-y-5">
        <PageHeader title={placeholder} />
        <p className="rounded border border-dashed border-gray-300 py-10 text-center text-body text-gray-500">
          {placeholder} 화면은 준비 중입니다.
        </p>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col gap-5">
      {/* 대시보드: HUB에서 이관. 다른 메뉴와 마찬가지로 '메뉴명 + 구분선'으로 시작한다. */}
      {tab === 'dashboard' && (
        <>
          <PageHeader title="대시보드" />
          <DashboardPanel />
        </>
      )}
      {tab === 'managers' && <OfficeManagersPanel />}
      {/* 부서 정보: MANAGEMENT 조직 관리와 같은 조직도를 조회 전용으로 재사용한다. */}
      {tab === 'departments' && (
        <>
          <PageHeader title="부서 정보" />
          <DepartmentsPanel readOnly />
        </>
      )}
      {/* 전자결재: 전자결재 워크스페이스에서 이관한 결재 문서 테이블. */}
      {tab === 'approval' && (
        <>
          <PageHeader title="전자결재" />
          <ApprovalTable />
        </>
      )}
    </div>
  )
}
