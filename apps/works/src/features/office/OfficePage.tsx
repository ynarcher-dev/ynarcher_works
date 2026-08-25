import { EmptyState, PageHeader, Spinner } from '@ynarcher/ui'
import { Navigate, useSearchParams } from 'react-router-dom'
import { ApprovalTable } from '@/features/approval/ApprovalTable'
import { ApprovalSummaryMock } from '@/features/approval/ApprovalSummaryMock'
import { ArchiveWorkspace } from '@/features/hub/ArchiveWorkspace'
import { BoardWorkspace } from '@/features/hub/BoardWorkspace'
import { DashboardPanel } from '@/features/hub/DashboardPanel'
import { NoticeWorkspace } from '@/features/hub/NoticeWorkspace'
import { NOTICE_TAB } from '@/features/hub/boardPostStore'
import { useBoardPostBoardId } from '@/features/hub/boardPostsApi'
import { useBoards } from '@/features/hub/boardHooks'
import { OfficeManagersPanel } from '@/features/office/OfficeManagersPanel'
import { BranchesPanel } from '@/features/office/branches/BranchesPanel'
import { AssetListWorkspace } from '@/features/office/assets/AssetListWorkspace'
import { MinutesWorkspace } from '@/features/office/minutes/MinutesWorkspace'
import { RoomReservationWorkspace } from '@/features/office/rooms/RoomReservationWorkspace'

/** 페이지 골격만 있는 준비 중 메뉴(탭 → 제목). */
const PLACEHOLDER_TITLES: Record<string, string> = {
  // 거래처 정보: 전자결재 워크스페이스에서 이관, 세부 기능은 후속 작업(골격만).
  clients: '거래처 정보',
}

/**
 * OFFICE 워크스페이스: 대시보드 + 임직원 정보·회의실 예약 + 전자결재·거래처 정보 + 게시판 홈.
 * 좌측 사이드바(?tab)로 섹션을 전환하며, 신규 게시판(ADMIN 게시판 관리 생성)이 모두 이곳에
 * 노출된다. AI 에이전트·전사 캘린더는 상단바 전역 진입점(우측 슬라이드오버)에서 연다.
 */
export function OfficePage() {
  const [params] = useSearchParams()
  const boardsQuery = useBoards()
  const boards = boardsQuery.data ?? []

  const tab = params.get('tab')
  const post = params.get('post') ?? undefined

  // 게시글이 이미 어느 게시판 탭 안에서 열려 있는지(공지사항 딥링크 등은 tab을 이미 갖고 있다).
  const tabBoard = boards.find((b) => b.slug === tab && b.isActive)

  // 코멘트 멘션 알림은 slug 없이 /office?post=<id>로 들어온다. 글의 게시판을 찾아 탭을 보정한다.
  // (탭이 이미 그 게시판을 가리키면 아래 분기를 건너뛰어 정상 렌더로 진행한다.)
  const needBoardLookup = Boolean(post) && !tabBoard
  const boardIdQuery = useBoardPostBoardId(needBoardLookup ? post : undefined)
  if (needBoardLookup) {
    if (boardsQuery.isLoading || boardIdQuery.isLoading) return <Spinner />
    const postBoard = boards.find((b) => b.id === boardIdQuery.data)
    if (postBoard) return <Navigate to={`/office?tab=${postBoard.slug}&post=${post}`} replace />
    // 게시판을 못 찾으면(접근 불가·삭제) 아래 일반 흐름으로 떨어진다(탭 없으면 대시보드).
  }

  // 탭 미지정 시 최상단 대시보드로 정규화(사이드바 활성 상태와 URL 동기화).
  if (!tab) return <Navigate to="/office?tab=dashboard" replace />

  // 부서 정보는 임직원 정보로 합쳐졌다(목록=조직, 상세=임직원). 기존 링크·북마크를 넘겨준다.
  if (tab === 'departments') return <Navigate to="/office?tab=managers" replace />

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
  const board = tabBoard
  if (board) {
    return (
      <div className="flex h-full flex-col">
        {board.kind === 'ARCHIVE' ? (
          <ArchiveWorkspace
            key={board.slug}
            boardId={board.id}
            title={board.label}
          />
        ) : (
          <BoardWorkspace
            key={board.slug}
            boardId={board.id}
            title={board.label}
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
        <EmptyState title={`${placeholder} 화면은 준비 중입니다`} />
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col gap-5">
      {/* 대시보드: HUB에서 이관. 여기만 '메뉴명 + 구분선'을 두지 않는다 — 홈은 카드가 스스로
          제목을 달고 서는 자리라, 페이지 제목까지 얹으면 첫 화면 한 줄을 제목이 먹는다. */}
      {tab === 'dashboard' && <DashboardPanel />}
      {/* 임직원 정보: 목록은 조직 트리+인물 카드(구 부서 정보), 상세는 임직원 상세로 간다. */}
      {tab === 'managers' && <OfficeManagersPanel />}
      {/* 자산 현황: 회사에 어떤 공용 물품이 어느 지사에 있나(조회 전용). 원장은 MANAGEMENT 자산 관리가 소유한다. */}
      {tab === 'outbound' && (
        <AssetListWorkspace initialAssetId={params.get('asset') ?? undefined} />
      )}
      {/* 회의실 예약: 지사 탭 + 날짜 이동 + 회의실 카드. 설정은 ADMIN이 소유한다. */}
      {tab === 'rooms' && <RoomReservationWorkspace />}
      {/* 회의록: STARTUP에서 이관. 자체 목록/상세/작성 흐름과 헤더를 소유한다. */}
      {tab === 'minutes' && <MinutesWorkspace initialMinuteId={params.get('minute') ?? undefined} />}
      {/* 지사 정보: ADMIN '지사 관리'가 소유한 지사 원장을 조회 전용 리스트뷰로 노출한다. */}
      {tab === 'branches' && <BranchesPanel />}
      {/* 전자결재: 전자결재 워크스페이스에서 이관한 결재 문서 테이블. */}
      {tab === 'approval' && (
        <>
          <PageHeader title="전자결재" />
          <ApprovalSummaryMock />
          <ApprovalTable />
        </>
      )}
    </div>
  )
}
