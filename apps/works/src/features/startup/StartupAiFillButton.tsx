import { Button, cardText } from '@ynarcher/ui'
import { useState } from 'react'
import type { EntityRow } from '@/features/master/entityHooks'
import { StartupAiFillModal } from '@/features/startup/StartupAiFillModal'
import type { AiFillResult, AiSource } from '@/features/startup/startupAiFill'
import type { AiCardKey } from '@/features/startup/startupAiCards'
import type { AiGrid } from '@/features/startup/startupAiGrid'
import type { AiFillOutcome } from '@/features/startup/startupAiMerge'

/**
 * 자료 관리 카드 아래에 서는 'AI 작성하기' 진입 버튼.
 *
 * 자리가 여기인 이유는 **재료 옆**이기 때문이다 — 이 기능이 읽는 것은 그 카드에 올라간
 * 파일이라, 재료에서 떨어뜨리면 무엇을 근거로 채우는지가 화면에서 사라진다.
 *
 * **편집 폼(등록·수정) 안에만 선다.** 조회 화면에는 두지 않는다 — 조회는 읽기만 하는 자리이고,
 * 거기서 누르면 값을 바꾸는 일이 시작되어 그 화면이 말하는 것과 하는 일이 어긋난다. 폼 안에
 * 있으면 초안이 다른 입력과 같은 자리에서 같은 방식으로 확정된다(저장 버튼 하나).
 *
 * 근거: docs/docs_planning/3_3_5_startup_ai_fill.md §4.1
 */
export function StartupAiFillButton({
  sources,
  snapshot,
  loading = false,
  startupId,
  companyName,
  onFilled,
}: {
  /** 고를 수 있는 자료(수정: 올라간 첨부 / 등록: 아직 안 올라간 파일). */
  sources: AiSource[]
  /** 지금 폼에 적힌 값을 원장 행 모양으로 세운 것. 기본 체크와 병합의 기준이 된다. */
  snapshot: EntityRow
  loading?: boolean
  /** 수정 모드의 대상 id. 등록 모드에는 아직 없다. */
  startupId?: string
  companyName?: string
  /**
   * 초안을 폼에 얹고 **그 결과**를 돌려준다.
   *
   * 돌려받는 이유는 창이 결과를 그 자리에서 보여 주기 때문이다(2026-09-06). 합치는 판단은
   * 폼이 자기 살아 있는 값 위에서 하고, 그 답 하나를 화면 두 곳(창 안 결과 패널·폼 맨 위
   * 안내)이 함께 읽는다.
   */
  onFilled: (result: AiFillResult, cards: AiCardKey[]) => AiFillOutcome
}) {
  const [open, setOpen] = useState(false)
  /**
   * 카드별 자료 배정(격자). **창이 아니라 여기에 둔다.**
   *
   * 한 요청이 실패하면 그 카드만 다시 돌려야 하는데, 창을 닫을 때 선택이 사라지면 열넷을
   * 처음부터 다시 골라야 한다. 여기 있으면 다시 열었을 때 방금 고른 격자가 그대로 서고
   * 담당자는 실패한 줄만 남기면 된다. 없는 자료를 가리키는 칸은 창이 걷는다(`pruneGrid`).
   */
  const [grid, setGrid] = useState<AiGrid>({})
  const hasReadable = sources.some((s) => s.readable)

  return (
    <div>
      {/* **브랜드 채움 + 페이지 밀도를 의도적으로 쓴다**(2026-09-06 사용자 결정).
          이 버튼은 자료 카드 밖에 형제로 서 있어 페이지 밀도(40px)를 그대로 받고, 그래서
          위 카드의 파일 줄(32px)보다 한 치수 크다. 줄이지 않는 이유는 이 버튼이 폼에서
          담당자가 **가장 먼저 누르는 행동**이기 때문이다 — 빈 폼을 손으로 채우기 전에
          자료로 초안을 만드는 것이 이 화면의 정상 순서라, 자료 카드 아래에서 먼저 눈에
          걸려야 한다.

          한 화면에 브랜드 채움이 둘이 되는 것(상단바의 등록·확정과 여기)은 **알고 받는
          대가**다. 둘이 하는 일이 시간 축에서 갈리기 때문에 실제로는 다투지 않는다 —
          이것은 폼을 채우기 시작하는 버튼이고 저장은 끝내는 버튼이며, 자리도 위아래로
          멀리 떨어져 있다. 다만 이 예외를 다른 화면으로 복사하지는 말 것. */}
      <Button
        className="w-full"
        disabled={loading || !hasReadable}
        onClick={() => setOpen(true)}
      >
        AI 작성하기
      </Button>
      {/* 막힌 이유는 접지 않는다 — 다음에 무엇을 해야 하는지를 지시하는 안내다. */}
      {!loading && !hasReadable && (
        <p className={`mt-1.5 ${cardText.meta}`}>읽을 수 있는 자료를 먼저 첨부하세요.</p>
      )}
      {open && (
        <StartupAiFillModal
          sources={sources}
          snapshot={snapshot}
          startupId={startupId}
          companyName={companyName}
          grid={grid}
          onGrid={setGrid}
          onClose={() => setOpen(false)}
          // 실행해도 창을 닫지 않는다 — 결과는 창 안에서 서고, 실패한 카드만 남겨 다시
          // 실행하는 것이 그다음의 정상 행동이다.
          onFilled={onFilled}
        />
      )}
    </div>
  )
}
