import { useMemo } from 'react'
import { Button, Card, EmptyState, Spinner } from '@ynarcher/ui'
import { useAuthStore } from '@/auth/authStore'
import { useRightPanel } from '@/app/rightPanel'
import { QuickMemoTile } from '@/features/quick-memo/QuickMemoTile'
import { DASHBOARD_CARD_FOOTER, DASHBOARD_TILE_AREA } from '@/features/hub/dashboard/tileArea'
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
 * 훑는 목적이 달라 홈에 남는다.
 *
 * 다 끝낸 목록은 **목록에는 남되 머리의 숫자에서는 빠진다**(2026-08-26). 숫자는 "아직 할 일이
 * 몇 건인가"를 답하는 자리라 끝난 것을 세면 답이 틀리고, 반대로 목록에서까지 지워 버리면
 * 오늘 처리한 것이 홈에서 흔적 없이 사라져 "내가 지웠나" 싶은 자리가 된다. 대신 끝난 것은
 * 뒤로 내려앉혀(정렬) 남은 일이 세 장 자리를 먼저 차지하게 한다.
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
  // 그 위에 "끝난 것은 뒤로" 한 겹만 얹는다 — sort는 안정 정렬이라 두 무리 안에서는 서버가
  // 정한 순서가 그대로 유지된다.
  const checklists = useMemo(
    () => memos
      .filter((memo) => memo.type === 'CHECKLIST' && !isQuickMemoEmpty(memo))
      .sort((a, b) => Number(isChecklistDone(a)) - Number(isChecklistDone(b))),
    [memos],
  )

  // 머리의 숫자는 남은 건수만 답한다(끝난 것은 목록에만 남는다).
  const pendingCount = useMemo(
    () => checklists.filter((memo) => !isChecklistDone(memo)).length,
    [checklists],
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
      count={pendingCount}
      // 머리에는 이 카드에서만 할 수 있는 일(새로 만들기)만 둔다. '전체 보기'는 두 카드 모두
      // 자리 아래 한 줄로 내려갔다 — 건수와 무관하게 늘 서므로 짝의 높이도 어긋나지 않는다.
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
      <Button variant="ghost" className={DASHBOARD_CARD_FOOTER} onClick={() => open('memo')}>
        전체 보기
      </Button>
    </Card>
  )
}
