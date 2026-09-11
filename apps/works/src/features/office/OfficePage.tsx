import { EmptyState, PageHeader, Spinner } from '@ynarcher/ui'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { ArchiveWorkspace } from '@/features/hub/ArchiveWorkspace'
import { BoardSectionNav } from '@/features/hub/BoardSectionNav'
import { BoardWorkspace } from '@/features/hub/BoardWorkspace'
import { NoticeWorkspace } from '@/features/hub/NoticeWorkspace'
import { NOTICE_TAB } from '@/features/hub/boardPostStore'
import { useBoardPostBoardId } from '@/features/hub/boardPostsApi'
import { useBoards } from '@/features/hub/boardHooks'
import { BOARD_KIND_LABEL, boardsOfKind, type BoardKind } from '@/features/hub/boardStore'
import { OfficeManagersPanel } from '@/features/office/OfficeManagersPanel'
import { BranchesPanel } from '@/features/office/branches/BranchesPanel'
import { AssetListWorkspace } from '@/features/office/assets/AssetListWorkspace'
import { MinutesWorkspace } from '@/features/office/minutes/MinutesWorkspace'
import { RoomReservationWorkspace } from '@/features/office/rooms/RoomReservationWorkspace'

/**
 * 페이지 골격만 있는 준비 중 메뉴(탭 → 제목).
 * 지금은 비어 있다.
 */
const PLACEHOLDER_TITLES: Record<string, string> = {}

/**
 * 공용 오피스: 임직원 정보·공용 자원·회의·게시 공간.
 * 좌측 사이드바(?tab)로 섹션을 전환하며, 신규 게시판(ADMIN 게시판 관리 생성)이 모두 이곳에
 * 노출된다. AI 에이전트·전사 캘린더는 상단바 전역 진입점(우측 슬라이드오버)에서 연다.
 */
export function OfficePage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
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
    // 게시판을 못 찾으면(접근 불가·삭제) 아래 일반 흐름으로 떨어진다(탭 없으면 공지사항).
  }

  // 탭 미지정 시 공용 오피스의 기본 화면인 공지사항으로 정규화한다.
  // 게시판 상위 메뉴도 공지사항 탭을 자기 활성 상태로 판정하므로 사이드바와 URL이 함께 맞는다.
  if (!tab) return <Navigate to={`/office?tab=${NOTICE_TAB}`} replace />

  // 메뉴 분리 전 OFFICE에 있던 개인 대시보드·전자결재 딥링크를 새 자리로 넘긴다.
  if (tab === 'dashboard' || tab === 'approval') {
    const next = new URLSearchParams(params)
    return <Navigate to={`/my-office?${next.toString()}`} replace />
  }

  // 부서 정보는 임직원 정보로 합쳐졌다(목록=조직, 상세=임직원). 기존 링크·북마크를 넘겨준다.
  if (tab === 'departments') return <Navigate to="/office?tab=managers" replace />

  // 게스트 계정은 2026-09-07 저녁에 AC 'GUEST계정 발급'으로 모였다(근거는 config/navigation.ts의
  // programSubnav 주석). OFFICE 사이드바에서는 그때 줄이 빠졌는데 화면 분기만 남아 있어, 메뉴에는
  // 없고 주소로는 열리는 자리가 됐다 — 그것도 **전사 범위**라 AC의 좁힌 화면과 같은 목록을 다르게
  // 답했다. 목록으로 떨어뜨리지 않고 새 자리로 보내는 것은 STARTUP과 같은 이유다.
  if (tab === 'guest-accounts') return <Navigate to="/ac?tab=guest-accounts" replace />

  // 1차 메뉴(`boards`/`archives`)로 들어오면 해당 종류의 첫 항목을 기본 선택한다. 실제 게시판
  // slug URL도 그대로 받으므로 알림·북마크 딥링크는 이전 주소를 유지한다.
  const requestedKind: BoardKind | undefined =
    tab === 'boards' || tab === NOTICE_TAB
      ? 'POST'
      : tab === 'archives'
        ? 'ARCHIVE'
        : tabBoard?.kind
  const sectionBoards = requestedKind ? boardsOfKind(boards, requestedKind) : []
  const board = tabBoard ?? (tab === 'archives' ? sectionBoards[0] : undefined)

  // 공지사항은 게시판 2차 사이드바의 고정 첫 항목이다. 1차 `게시판` 메뉴로 들어와도 이 화면을
  // 기본으로 열며, 기존 `?tab=notices` 딥링크도 그대로 받는다.
  if (tab === 'boards' || tab === NOTICE_TAB) {
    return (
      <div className="flex h-full flex-col">
        <NoticeWorkspace
          navigation={
            <BoardSectionNav
              kind="POST"
              boards={sectionBoards}
              selectedKey={NOTICE_TAB}
              onSelect={(key) => navigate(`/office?tab=${key}`)}
            />
          }
        />
      </div>
    )
  }

  // 등록된 항목이 아직 없어도 1차 메뉴를 열 수 있어야 한다. 2차 사이드바와 빈 상태를 함께
  // 보여 주어 ADMIN 게시판 관리에서 항목을 추가해야 한다는 맥락을 잃지 않는다.
  if ((tab === 'boards' || tab === 'archives') && !board) {
    if (boardsQuery.isLoading) return <Spinner />
    const kind: BoardKind = tab === 'archives' ? 'ARCHIVE' : 'POST'
    const title = BOARD_KIND_LABEL[kind]
    return (
      <div className="flex h-full flex-col gap-5">
        <PageHeader title={title} />
        <div className="flex min-h-0 flex-1 gap-5">
          <BoardSectionNav kind={kind} boards={[]} onSelect={() => undefined} />
          <div className="min-w-0 flex-1">
            <EmptyState title={`등록된 ${title}이 없습니다`} />
          </div>
        </div>
      </div>
    )
  }

  // 게시 탭은 종류에 따라 화면이 갈린다. 목록 왼쪽의 2차 사이드바는 두 종류가 같은 부품을 쓴다.
  // 게시판(POST)=상세페이지가 있는 BoardWorkspace / 자료실(ARCHIVE)=즉시 다운로드 목록.
  if (board) {
    const boardNavigation = (
      <BoardSectionNav
        kind={board.kind}
        boards={sectionBoards}
        selectedKey={board.slug}
        onSelect={(key) => navigate(`/office?tab=${key}`)}
      />
    )
    return (
      <div className="flex h-full flex-col">
        {board.kind === 'ARCHIVE' ? (
          <ArchiveWorkspace
            key={board.slug}
            boardId={board.id}
            title={board.label}
            navigation={boardNavigation}
          />
        ) : (
          <BoardWorkspace
            key={board.slug}
            boardId={board.id}
            title={board.label}
            initialPostId={params.get('post') ?? undefined}
            navigation={boardNavigation}
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
      {/* 임직원 정보: 목록은 조직 트리+인물 카드(구 부서 정보), 상세는 임직원 상세로 간다. */}
      {tab === 'managers' && <OfficeManagersPanel />}
      {/* 자산 현황: 회사에 어떤 공용 물품이 어느 지사에 있나(조회 전용). 원장은 MANAGEMENT 자산 관리가 소유한다. */}
      {tab === 'outbound' && (
        <AssetListWorkspace initialAssetId={params.get('asset') ?? undefined} />
      )}
      {/* 회의실 예약: 지사 탭 + 날짜 이동 + 회의실 카드. 설정은 ADMIN이 소유한다. */}
      {tab === 'rooms' && <RoomReservationWorkspace />}
      {/* 회의록: STARTUP에서 이관. 자체 목록/상세/작성 흐름과 헤더를 소유한다. */}
      {tab === 'minutes' && <MinutesWorkspace />}
      {/* 지사 정보: ADMIN '지사 관리'가 소유한 지사 원장을 조회 전용 리스트뷰로 노출한다. */}
      {tab === 'branches' && <BranchesPanel />}
    </div>
  )
}
