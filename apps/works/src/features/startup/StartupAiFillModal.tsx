import { Banner, Button, Modal, Spinner, cardText } from '@ynarcher/ui'
import { useMemo, useState } from 'react'
import type { EntityRow } from '@/features/master/entityHooks'
import { formatBytes } from '@/features/networks/materialHooks'
import { AI_FILL_LIMITS, useAiFill, type AiFillResult, type AiSource } from '@/features/startup/startupAiFill'
import { AI_CARDS, type AiCardKey } from '@/features/startup/startupAiCards'
import { StartupAiFillGrid } from '@/features/startup/StartupAiFillGrid'
import { AiBlockedList } from '@/features/startup/StartupAiFillPicker'
import {
  cellCount,
  gridCards,
  gridSourceKeys,
  pruneGrid,
  toggleCard,
  toggleCell,
  toggleGrid,
  toggleSource,
  type AiGrid,
} from '@/features/startup/startupAiGrid'

/**
 * 'AI 작성하기' 모달 — 카드마다 읽을 자료를 격자에서 고르고 한 번에 실행한다.
 *
 * 자료 목록과 기준 값(`snapshot`)을 **받아서** 쓴다. 목록이 준비된 뒤에 열리는 것을 버튼이
 * 보장한다.
 *
 * 기준 값이 원장 행이 아니라 **지금 폼에 적힌 값**인 것이 요점이다 — 격자 카드 열의 `Y`/`N`은
 * 저장된 값이 아니라 화면에 보이는 값을 두고 하는 말이어야 한다.
 *
 * **담당자는 한 번만 실행한다.** 나누는 일은 서버가 한다 — 같은 자료의 소수 카드는 한 요청,
 * 카드가 많으면 탐색 축별 요청으로 보내고 자료는 조합이 몇 벌이든 한 번만 올린다. 그래서 이
 * 화면에는 묶음이라는 말이 없다.
 *
 * 격자 상태를 위(`StartupAiFillButton`)에서 받는 이유는 **재실행** 때문이다. 한 요청이
 * 실패하면 그 카드만 다시 돌려야 하는데, 창을 닫을 때 선택이 사라지면 열넷을 처음부터 다시
 * 골라야 한다.
 *
 * 봉투는 그대로 상위로 올린다. 병합은 폼이 자기 살아 있는 값 위에서 한다(§4.5).
 *
 * 근거: docs/docs_planning/3_3_5_startup_ai_fill.md §4
 */
export function StartupAiFillModal({
  sources,
  snapshot,
  startupId,
  companyName,
  grid,
  onGrid,
  onClose,
  onFilled,
}: {
  sources: AiSource[]
  snapshot: EntityRow
  startupId?: string
  companyName?: string
  grid: AiGrid
  onGrid: (next: AiGrid) => void
  onClose: () => void
  onFilled: (result: AiFillResult, cards: AiCardKey[]) => void
}) {
  const fill = useAiFill()
  const [error, setError] = useState<string | null>(null)

  const readable = useMemo(() => sources.filter((s) => s.readable), [sources])
  const blocked = sources.filter((s) => !s.readable)
  const allKeys = useMemo(() => readable.map((s) => s.key), [readable])

  // 자료가 바뀌었을 수 있다(실행 뒤 첨부를 지우거나 더한 경우). 없는 자료를 가리키는 칸을
  // 걷지 않으면 카드 열의 건수가 거짓을 말한다 — 3건이라 적혀 있는데 읽는 것은 둘이다.
  const live = useMemo(() => pruneGrid(grid, allKeys), [grid, allKeys])

  const cards = gridCards(live)
  const chosenKeys = new Set(gridSourceKeys(live))
  const chosen = readable.filter((s) => chosenKeys.has(s.key))
  // 자료는 카드가 몇이든 **한 번만** 올라가므로 크기도 한 번만 센다.
  const totalBytes = chosen.reduce((sum, s) => sum + Number(s.bytes ?? 0), 0)
  const tooLarge = totalBytes > AI_FILL_LIMITS.maxTotalBytes
  // 합계와 별개로 한 건이 큰 경우를 따로 본다 — 합계만 말하면 어느 자료를 빼야 하는지 모른다.
  const oversized = chosen.filter((s) => Number(s.bytes ?? 0) > AI_FILL_LIMITS.maxSingleBytes)
  const busy = fill.isPending
  const ready = cards.length > 0 && !tooLarge && oversized.length === 0 && !busy

  // 켜진 카드 중 이미 값이 있는 것 — 무엇이 바뀌는지는 줄마다가 아니라 여기서 한 번 말한다
  // (줄마다 세우면 같은 경고가 열두 번 서서 정작 어느 카드인지가 그 문장에 묻힌다).
  const overwritten = AI_CARDS.filter((c) => cards.includes(c.key) && c.filled(snapshot))

  const run = async () => {
    setError(null)
    try {
      const result = await fill.mutateAsync({
        startupId,
        companyName,
        sources: chosen,
        cards,
        assignments: live,
      })
      onFilled(result, cards)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'AI 작성에 실패했습니다.')
    }
  }

  return (
    <Modal
      open
      onClose={busy ? () => undefined : onClose}
      // 쓰던 것이 있는 모달이라 딤 클릭으로 닫지 않는다(고른 칸이 클릭 한 번에 사라지면 안 된다).
      dismissible={false}
      size="3xl"
      title="AI 작성하기"
      help="카드마다 읽을 자료를 지정하면 그 자료만 근거로 초안을 만듭니다. 카드가 쓰지 않을 자료를 빼면 결과가 정확해집니다 — 재무 카드에 발표 자료가 함께 들어가면 확정 재무 대신 목표 수치를 가져올 수 있습니다. 선택한 자료는 외부 AI(Google Gemini)로 전송되며 반출 기록이 남습니다. 결과는 편집 화면에 채워지고 저장 전까지 원장은 바뀌지 않습니다. 문서를 눈으로 보듯 이해하는 것은 PDF와 이미지뿐입니다 — 엑셀·워드·파워포인트는 서버가 열어 글자와 표로 바꿔 보내므로 표는 그대로 옮겨지지만, 발표 자료(PPTX)는 그림과 배치가 빠집니다. IR 자료는 PDF로 저장해 올리는 편이 낫습니다."
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            취소
          </Button>
          <Button onClick={run} disabled={!ready}>
            {busy ? '작성 중…' : `선택한 ${cards.length}개 카드 작성`}
          </Button>
        </div>
      }
    >
      {busy ? (
        <div className="flex flex-col items-center gap-3 py-10">
          <Spinner />
          {/* 서버가 한 번의 응답이라 진척값이 없다. 없는 단계를 지어내지 않는다. */}
          <p className={cardText.value}>선택한 자료에서 기업 정보를 분석하고 있습니다.</p>
          <p className={cardText.meta}>자료 크기에 따라 1~2분이 걸릴 수 있습니다.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {error && <Banner tone="danger">{error}</Banner>}

          <StartupAiFillGrid
            sources={readable}
            record={snapshot}
            grid={live}
            onCell={(card, key) => onGrid(toggleCell(live, card, key))}
            onCard={(card) => onGrid(toggleCard(live, card, allKeys))}
            onSource={(key) => onGrid(toggleSource(live, key, AI_CARDS.map((c) => c.key)))}
            onAll={() => onGrid(toggleGrid(live, AI_CARDS.map((c) => c.key), allKeys))}
          />

          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
            <p className={cardText.meta}>
              카드 {cards.length}개 · 자료 {chosen.length}건 · 합계 {formatBytes(totalBytes)}
            </p>
            <p className={cardText.meta}>선택한 칸 {cellCount(live)}개</p>
          </div>

          {/* 막힌 이유는 접지 않는다 — 왜 실행 버튼이 안 눌리는지를 이 줄이 답한다. */}
          {tooLarge && (
            <p className="text-caption text-danger">
              합계가 {formatBytes(AI_FILL_LIMITS.maxTotalBytes)}를 넘습니다. 자료를 줄여 주세요.
            </p>
          )}
          {oversized.length > 0 && (
            <p className="text-caption text-danger">
              한 건이 {formatBytes(AI_FILL_LIMITS.maxSingleBytes)}를 넘습니다:{' '}
              {oversized.map((s) => s.name).join(' · ')}
            </p>
          )}
          {/* 되돌릴 수 있다는 말을 함께 적는다 — 경고가 과하면 정작 필요한 갱신을 망설인다. */}
          {overwritten.length > 0 && (
            <p className="text-caption text-warning">
              현재 값이 AI 결과로 바뀝니다: {overwritten.map((c) => c.label).join(' · ')}. 저장 전까지는
              되돌릴 수 있습니다.
            </p>
          )}

          <AiBlockedList sources={blocked} />
        </div>
      )}
    </Modal>
  )
}
