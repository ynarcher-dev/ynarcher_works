import { Banner, Button, CardHeading, Checkbox, Modal, Spinner, cardText } from '@ynarcher/ui'
import { useState } from 'react'
import type { EntityRow } from '@/features/master/entityHooks'
import { formatBytes } from '@/features/networks/materialHooks'
import { AI_FILL_LIMITS, useAiFill, type AiSource } from '@/features/startup/startupAiFill'
import { defaultCardSelection, type AiCardKey } from '@/features/startup/startupAiCards'
import { AiCardList, AiFileList } from '@/features/startup/StartupAiFillPicker'
import type { AiFillEnvelope } from '@/features/startup/startupAiMerge'

/**
 * 'AI 작성하기' 모달 — 읽을 자료와 작성할 카드를 고르고 초안을 받는다.
 *
 * 자료 목록과 기준 값(`snapshot`)을 **받아서** 쓴다. 기본 선택이 "PDF 전부 · 빈 카드 전부"인데
 * 목록이 준비되기 전에 마운트되면 그 기본값이 빈 채로 굳어 담당자가 매번 손으로 다시 고르게
 * 된다. 목록이 준비된 뒤에 열리는 것을 버튼이 보장한다.
 *
 * 기준 값이 원장 행이 아니라 **지금 폼에 적힌 값**인 것이 요점이다 — '작성됨'은 저장된 값이
 * 아니라 화면에 보이는 값을 두고 하는 말이어야 하고, 방금 손으로 적은 줄이 있는 카드는
 * 기본으로 꺼져야 한다.
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
  onFilled: (envelope: AiFillEnvelope, cards: AiCardKey[]) => void
}) {
  const fill = useAiFill()

  // 기본 선택: PDF 전부(상한 안에서), 빈 카드 전부. 담당자가 아무것도 만지지 않고 실행해도
  // 이미 적혀 있는 값은 그대로 남는다 — 기본값이 지키는 쪽에 서야 안전장치가 된다.
  const [picked, setPicked] = useState<string[]>(() =>
    sources.filter((s) => s.pdf).slice(0, AI_FILL_LIMITS.maxFiles).map((s) => s.key),
  )
  const [cards, setCards] = useState<AiCardKey[]>(() => defaultCardSelection(snapshot))
  const [agreed, setAgreed] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const chosen = sources.filter((s) => picked.includes(s.key))
  const totalBytes = chosen.reduce((sum, s) => sum + Number(s.bytes ?? 0), 0)
  const tooLarge = totalBytes > AI_FILL_LIMITS.maxTotalBytes
  const tooMany = chosen.length > AI_FILL_LIMITS.maxFiles
  const busy = fill.isPending
  const ready = chosen.length > 0 && cards.length > 0 && agreed && !tooLarge && !tooMany && !busy

  const togglePick = (key: string) =>
    setPicked((prev) => (prev.includes(key) ? prev.filter((v) => v !== key) : [...prev, key]))
  const toggleCard = (key: AiCardKey) =>
    setCards((prev) => (prev.includes(key) ? prev.filter((v) => v !== key) : [...prev, key]))

  const run = async () => {
    setError(null)
    try {
      const envelope = await fill.mutateAsync({ startupId, companyName, sources: chosen, cards })
      onFilled(envelope, cards)
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
      size="lg"
      title="AI 작성하기"
      help="첨부한 PDF 자료를 근거로 선택한 카드의 초안을 만듭니다. 결과는 편집 화면에 채워지며, 저장 전까지 원장은 바뀌지 않습니다."
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
        <div className="space-y-5">
          {error && <Banner tone="danger">{error}</Banner>}

          <section>
            <CardHeading level="subhead">읽을 자료</CardHeading>
            <div className="mt-2">
              <AiFileList sources={sources} selected={picked} onToggle={togglePick} />
            </div>
            <p className={`mt-2 ${cardText.meta}`}>
              선택 {chosen.length}개 · 합계 {formatBytes(totalBytes)}
            </p>
            {/* 막힌 이유는 접지 않는다 — 왜 실행 버튼이 안 눌리는지를 이 줄이 답한다. */}
            {tooLarge && (
              <p className="mt-1 text-caption text-danger">합계가 14MB를 넘습니다. 파일을 줄여 주세요.</p>
            )}
            {tooMany && (
              <p className="mt-1 text-caption text-danger">
                한 번에 {AI_FILL_LIMITS.maxFiles}개까지 읽을 수 있습니다.
              </p>
            )}
          </section>

          <section>
            <CardHeading
              level="subhead"
              help="체크를 해제한 카드는 AI가 건드리지 않고 지금 적혀 있는 값을 그대로 둡니다. 이미 값이 있는 카드는 기본으로 꺼져 있습니다."
            >
              작성할 카드
            </CardHeading>
            <div className="mt-2">
              <AiCardList record={snapshot} selected={cards} onToggle={toggleCard} />
            </div>
          </section>

          {/* 자료가 외부로 나간다는 파급 고지는 접지 않는다. 동의는 저장하지 않고 매번 새로
              받는다 — 기업의 기밀 자료라 '한 번 켜 두면 계속'이어서는 안 된다. */}
          <Checkbox
            checked={agreed}
            onChange={() => setAgreed((v) => !v)}
            label="선택한 자료가 외부 AI(Google Gemini)로 전송되는 것에 동의합니다."
          />
        </div>
      )}
    </Modal>
  )
}
