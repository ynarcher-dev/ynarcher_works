import { useMemo } from 'react'
import { Button, Card, EmptyState, Spinner } from '@ynarcher/ui'
import { useAuthStore } from '@/auth/authStore'
import { useRightPanel } from '@/app/rightPanel'
import { QuickMemoTile } from '@/features/quick-memo/QuickMemoTile'
import { DASHBOARD_TILE_AREA } from '@/features/hub/dashboard/tileArea'
import { useQuickMemos } from '@/features/quick-memo/quickMemoApi'
import {
  createQuickMemo, draftQuickMemo, focusQuickMemo, isChecklistDone, isQuickMemoEmpty,
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
 * 훑는 목적이 달라 홈에 남는다 — 같은 이유로 **다 끝낸 목록은 이 자리에서 사라진다.**
 *
 * 쓰기(작성·수정·삭제)는 계속 슬라이드오버가 소유하고 여기서는 읽기와 열기만 한다 — 두 자리가
 * 각자의 상태로 같은 원장을 저장하면 나중에 저장한 쪽이 상대의 편집을 덮어쓴다. 타일을 누르면
 * 그 항목을 펼친 채로 패널이 열리고(`focusQuickMemo`), '새 체크리스트'는 저장하지 않은 초안만
 * 넘긴다(`draftQuickMemo`) — 여기서 빈 행을 먼저 만들면 그냥 닫았을 때 껍데기가 남는다.
 * 타일 모양은 패널 목록과 같은 한 벌(`QuickMemoTile`)이다.
 */
export function ChecklistCard() {
  const userId = useAuthStore((state) => state.user?.id) ?? 'anonymous'
  const { open } = useRightPanel()
  const { data: memos = [], isLoading } = useQuickMemos(userId)

  // 정렬은 서버 훅이 끝냈다(고정 우선 · 최근 수정 순). 빈 항목(작성 중 이탈)은 감춘다.
  // 다 끝낸 목록도 여기서 걷는다 — 이 카드는 "아직 남은 것"을 훑는 자리라, 완료분이 섞이면
  // 남은 일을 세 장 자리 밖으로 밀어낸다. 끝난 목록은 패널에 회색으로 남으니 사라지지는 않는다.
  const checklists = useMemo(
    () => memos.filter((memo) =>
      memo.type === 'CHECKLIST' && !isQuickMemoEmpty(memo) && !isChecklistDone(memo)),
    [memos],
  )

  const openMemo = (memo: QuickMemo) => {
    focusQuickMemo(memo.id)
    open('memo')
  }

  const createChecklist = () => {
    // 초안만 패널로 넘기고 저장은 패널에 맡긴다. 제목도 항목도 없이 닫으면 그대로 버려진다.
    draftQuickMemo(createQuickMemo('CHECKLIST'))
    open('memo')
  }

  return (
    <Card
      title="체크리스트"
      count={checklists.length}
      actions={<Button variant="outline" onClick={createChecklist}>새 체크리스트</Button>}
    >
      <div className={`flex flex-col ${DASHBOARD_TILE_AREA}`}>
        {isLoading ? (
          // 도착 전에는 빈 상태를 보이지 않는다 — 쌓아 둔 것이 있는 사람에게 "없습니다"가
          // 스쳐 지나가면 그것 자체가 유실 신호로 읽힌다.
          <div className="flex flex-1 items-center justify-center"><Spinner /></div>
        ) : checklists.length === 0 ? (
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
