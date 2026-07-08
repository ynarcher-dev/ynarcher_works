import { PageHeader } from '@ynarcher/ui'
import { Navigate, useSearchParams } from 'react-router-dom'
import { useAuthStore } from '@/auth/authStore'
import { BoardWorkspace } from '@/features/hub/BoardWorkspace'
import { CalendarPanel } from '@/features/hub/CalendarPanel'
import { useBoardStore } from '@/features/hub/boardStore'
import { OfficeManagersPanel } from '@/features/office/OfficeManagersPanel'

/** 페이지 골격만 있는 준비 중 메뉴(탭 → 제목). */
const PLACEHOLDER_TITLES: Record<string, string> = {
  rooms: '회의실 예약',
}

/**
 * OFFICE 워크스페이스: 회의실 예약(준비 중) + 임직원 정보·전사 캘린더 + 게시판 홈.
 * 좌측 사이드바(?tab)로 섹션을 전환하며, 신규 게시판(ADMIN 게시판 관리 생성)이 모두 이곳에 노출된다.
 */
export function OfficePage() {
  const [params] = useSearchParams()
  const userName = useAuthStore((s) => s.user?.name)
  const boards = useBoardStore((s) => s.boards)

  const tab = params.get('tab')

  // 탭 미지정 시 임직원 정보로 정규화(사이드바 활성 상태와 URL 동기화).
  if (!tab) return <Navigate to="/office?tab=managers" replace />

  // 게시판 탭(고정·일반 모두)은 자체 헤더(검색·글쓰기)를 가진 BoardWorkspace가 담당한다.
  const board = boards.find((b) => b.tab === tab && b.active)
  if (board) {
    return (
      <div className="flex h-full flex-col">
        <BoardWorkspace
          key={board.tab}
          boardTab={board.tab}
          title={board.label}
          authorName={userName}
        />
      </div>
    )
  }

  // 준비 중 메뉴(페이지 골격만). 세부 기능은 후속 작업.
  const placeholder = PLACEHOLDER_TITLES[tab]
  if (placeholder) {
    return (
      <div className="space-y-5">
        <PageHeader title={placeholder} />
        <p className="rounded border border-dashed border-gray-300 py-10 text-center text-body text-gray-400">
          {placeholder} 화면은 준비 중입니다.
        </p>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col gap-5">
      {tab === 'managers' && <OfficeManagersPanel />}
      {tab === 'calendar' && (
        <>
          <PageHeader title="전사 캘린더" />
          <CalendarPanel />
        </>
      )}
    </div>
  )
}
