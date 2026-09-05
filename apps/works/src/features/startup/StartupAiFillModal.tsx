import { Banner, Button, CardHeading, Modal, Spinner, cardText } from '@ynarcher/ui'
import { useState } from 'react'
import type { EntityRow } from '@/features/master/entityHooks'
import { formatBytes } from '@/features/networks/materialHooks'
import { AI_FILL_LIMITS, useAiFill, type AiFillResult, type AiSource } from '@/features/startup/startupAiFill'
import { AI_CARDS, type AiCardKey } from '@/features/startup/startupAiCards'
import { AiBlockedList, AiCardList, AiFileList } from '@/features/startup/StartupAiFillPicker'

/**
 * 'AI 작성하기' 모달 — 읽을 자료와 작성할 카드를 고르고 초안을 받는다.
 *
 * 자료 목록과 기준 값(`snapshot`)을 **받아서** 쓴다. 목록이 준비된 뒤에 열리는 것을 버튼이
 * 보장한다.
 *
 * 기준 값이 원장 행이 아니라 **지금 폼에 적힌 값**인 것이 요점이다 — 카드 줄의 `Y`/`N`은
 * 저장된 값이 아니라 화면에 보이는 값을 두고 하는 말이어야 한다. 방금 손으로 적어 아직
 * 저장하지 않은 줄이 있는 카드는 `Y`로 서야, 그 카드를 켤 때 무엇이 바뀌는지가 맞는 말이 된다.
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
  onClose,
  onFilled,
}: {
  sources: AiSource[]
  snapshot: EntityRow
  startupId?: string
  companyName?: string
  onClose: () => void
  onFilled: (result: AiFillResult, cards: AiCardKey[]) => void
}) {
  const fill = useAiFill()

  const readable = sources.filter((s) => s.readable)
  const blocked = sources.filter((s) => !s.readable)

  // **아무것도 켜지 않은 채 연다**(2026-09-06 사용자 지정). 종전에는 읽을 수 있는 자료 전부와
  // 빈 카드 전부를 미리 켜 두었는데, 그러면 창을 열자마자 열둘·열넷의 결정이 이미 내려져 있어
  // 실행 버튼을 누르는 일이 "고른 것을 실행한다"가 아니라 "정해진 것을 승인한다"가 된다.
  // 빈 상태로 시작하면 모든 실행이 담당자가 고른 것이 되고, 한 번에 켜는 일은 목록 첫 행의
  // 전체 선택이 한 번으로 해낸다.
  const [picked, setPicked] = useState<string[]>([])
  const [cards, setCards] = useState<AiCardKey[]>([])
  const [error, setError] = useState<string | null>(null)

  const chosen = readable.filter((s) => picked.includes(s.key))
  const totalBytes = chosen.reduce((sum, s) => sum + Number(s.bytes ?? 0), 0)
  const tooLarge = totalBytes > AI_FILL_LIMITS.maxTotalBytes
  // 합계와 별개로 한 건이 큰 경우를 따로 본다 — 합계만 말하면 어느 자료를 빼야 하는지 모른다.
  const oversized = chosen.filter((s) => Number(s.bytes ?? 0) > AI_FILL_LIMITS.maxSingleBytes)
  const busy = fill.isPending
  const ready = chosen.length > 0 && cards.length > 0 && !tooLarge && oversized.length === 0 && !busy

  const togglePick = (key: string) =>
    setPicked((prev) => (prev.includes(key) ? prev.filter((v) => v !== key) : [...prev, key]))
  const toggleAllPicks = () =>
    setPicked((prev) => (prev.length === readable.length ? [] : readable.map((s) => s.key)))
  const toggleCard = (key: AiCardKey) =>
    setCards((prev) => (prev.includes(key) ? prev.filter((v) => v !== key) : [...prev, key]))
  const toggleAllCards = () =>
    setCards((prev) => (prev.length === AI_CARDS.length ? [] : AI_CARDS.map((c) => c.key)))

  const run = async () => {
    setError(null)
    try {
      const result = await fill.mutateAsync({ startupId, companyName, sources: chosen, cards })
      onFilled(result, cards)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'AI 작성에 실패했습니다.')
    }
  }

  return (
    <Modal
      open
      onClose={busy ? () => undefined : onClose}
      // 쓰던 것이 있는 모달이라 딤 클릭으로 닫지 않는다(고른 카드가 클릭 한 번에 사라지면 안 된다).
      dismissible={false}
      size="2xl"
      title="AI 작성하기"
      help="첨부한 자료(파일·링크)를 근거로 선택한 카드의 초안을 만듭니다. 선택한 자료는 외부 AI(Google Gemini)로 전송되며 반출 기록이 남습니다. 결과는 편집 화면에 채워지고 저장 전까지 원장은 바뀌지 않습니다. 문서를 눈으로 보듯 이해하는 것은 PDF와 이미지뿐이고, 나머지 형식은 글자만 읽힙니다."
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
          <p className={cardText.value}>자료를 읽고 {cards.length}개 카드를 작성하고 있습니다.</p>
          <p className={cardText.meta}>자료 크기에 따라 1~2분이 걸릴 수 있습니다.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {error && <Banner tone="danger">{error}</Banner>}

          {/* 두 목록은 순서대로 거치는 단계가 아니라 함께 보며 맞추는 짝이라 좌우로 세운다
              (결재선 설정과 같은 구성). 좁은 화면에서는 자료가 먼저 온다 — 무엇을 근거로
              삼는지가 정해져야 어느 카드를 채울 수 있을지 가늠이 선다. */}
          <div className="grid grid-cols-1 gap-5 lg:min-h-[24rem] lg:grid-cols-2">
            <section className="flex min-h-0 flex-col gap-2">
              <CardHeading level="subhead">읽을 자료</CardHeading>
              <AiFileList
                sources={readable}
                selected={picked}
                onToggle={togglePick}
                onToggleAll={toggleAllPicks}
              />
              <p className={cardText.meta}>합계 {formatBytes(totalBytes)}</p>
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
              <AiBlockedList sources={blocked} />
            </section>

            <section className="flex min-h-0 flex-col gap-2">
              <CardHeading
                level="subhead"
                help="체크한 카드만 AI가 씁니다. 체크하지 않은 카드는 지금 적혀 있는 값을 그대로 둡니다. 오른쪽 Y·N은 지금 그 카드에 값이 있는지를 뜻하며, Y인 카드를 체크하면 그 값이 AI 결과로 바뀝니다."
              >
                작성할 카드
              </CardHeading>
              <AiCardList
                record={snapshot}
                selected={cards}
                onToggle={toggleCard}
                onToggleAll={toggleAllCards}
              />
            </section>
          </div>
        </div>
      )}
    </Modal>
  )
}
