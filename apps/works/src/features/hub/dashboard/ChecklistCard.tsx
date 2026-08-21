import { useMemo } from 'react'
import { Button, Card, EmptyState } from '@ynarcher/ui'
import { useAuthStore } from '@/auth/authStore'
import { useRightPanel } from '@/app/rightPanel'
import { QuickMemoTile } from '@/features/quick-memo/QuickMemoTile'
import { DASHBOARD_TILE_AREA } from '@/features/hub/dashboard/tileArea'
import {
  createQuickMemo, focusQuickMemo, isQuickMemoEmpty, loadQuickMemos, saveQuickMemos, useQuickMemos,
  type QuickMemo,
} from '@/features/quick-memo/quickMemoStore'

/** 카드에 세우는 타일 수. 넘치는 만큼은 "전체 보기"로 넘겨 카드 높이를 대시보드 규격에 묶어 둔다. */
const VISIBLE_TILES = 3

/**
 * OFFICE 대시보드의 체크리스트 칸 — 우측 상단 '퀵 메모' 슬라이드오버에 쌓아 둔 체크리스트를
 * 참여 중인 운영 아래에서 **펼치지 않고도** 보이게 한다.
 *
 * 메모(NOTE)는 이 자리에서 걷었다(2026-08-21) — 적어 둔 글은 상단바 슬라이드오버에서 읽고
 * 고치면 되고, 대시보드 앞자리는 전사 공지가 가져간다. 체크리스트는 "아직 남은 것"이라
 * 훑는 목적이 달라 홈에 남는다.
 *
 * 쓰기(작성·수정·삭제)는 계속 슬라이드오버가 소유하고 여기서는 읽기와 열기만 한다 — 두 자리가
 * 각자의 상태로 같은 원장을 저장하면 나중에 저장한 쪽이 상대의 편집을 덮어쓴다. 타일을 누르면
 * 그 항목을 펼친 채로 패널이 열리고(`focusQuickMemo`), 편집 결과는 저장 알림을 타고 이 카드로
 * 되돌아온다. 타일 모양은 패널 목록과 같은 한 벌(`QuickMemoTile`)이다.
 */
export function ChecklistCard() {
  const userId = useAuthStore((state) => state.user?.id) ?? 'anonymous'
  const { open } = useRightPanel()
  const memos = useQuickMemos(userId)

  // 패널 목록과 같은 정렬: 고정 먼저, 그다음 최근 수정 순. 빈 항목(작성 중 이탈)은 감춘다.
  const checklists = useMemo(
    () =>
      [...memos]
        .filter((memo) => memo.type === 'CHECKLIST' && !isQuickMemoEmpty(memo))
        .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt.localeCompare(a.updatedAt)),
    [memos],
  )

  const openMemo = (memo: QuickMemo) => {
    focusQuickMemo(memo.id)
    open('memo')
  }

  const createChecklist = () => {
    // 원장을 먼저 늘리고 패널을 연다 — 패널은 마운트하며 저장소를 다시 읽는다. 제목도 항목도
    // 없이 닫으면 패널이 그 빈 메모를 스스로 걷어내므로 여기서 뒷정리를 할 것이 없다.
    const memo = createQuickMemo('CHECKLIST')
    saveQuickMemos(userId, [memo, ...loadQuickMemos(userId)])
    openMemo(memo)
  }

  return (
    <Card
      title="체크리스트"
      count={checklists.length}
      actions={<Button variant="outline" onClick={createChecklist}>새 체크리스트</Button>}
    >
      <div className={`flex flex-col ${DASHBOARD_TILE_AREA}`}>
        {checklists.length === 0 ? (
          // 빈 상태는 잡아 둔 세 장 자리 한가운데 선다(기본 py-12는 그 자리를 넘기므로 걷는다).
          <EmptyState
            title="아직 만든 체크리스트가 없습니다."
            description="오늘 처리할 일을 목록으로 세워보세요."
            className="flex-1 py-0"
          />
        ) : (
          <div className="space-y-2">
            {checklists.slice(0, VISIBLE_TILES).map((memo) => (
              <QuickMemoTile key={memo.id} memo={memo} onClick={() => openMemo(memo)} titleOnly />
            ))}
          </div>
        )}
      </div>
      {checklists.length > VISIBLE_TILES && (
        // "전체 보기"는 잡아 둔 자리 밖에 둔다 — 자리 안에 넣으면 타일 한 장을 밀어낸다.
        <Button
          variant="ghost"
          className="mt-2 w-full justify-center text-gray-500"
          onClick={() => open('memo')}
        >
          전체 {checklists.length}개 보기
        </Button>
      )}
    </Card>
  )
}
