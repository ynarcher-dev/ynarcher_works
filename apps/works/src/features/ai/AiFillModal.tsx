import { Banner, Button, Modal, Spinner, cardText, cn } from '@ynarcher/ui'
import { useEffect, useMemo, useRef, useState } from 'react'
import { formatBytes } from '@/features/networks/materialHooks'
import {
  AI_FILL_LIMITS,
  useAiFill,
  type AiFillResult,
  type AiSource,
} from '@/features/ai/aiFillClient'
import { cardKeysOf, cardLabelMap, type AiFillCatalog } from '@/features/ai/aiCatalog'
import type { AiFillOutcome } from '@/features/ai/aiTypes'
import { writableCount } from '@/features/ai/aiExtractState'
import { useAiExtracts } from '@/features/ai/useAiExtracts'
import { AiFillGrid } from '@/features/ai/AiFillGrid'
import { AiFillResultPanel } from '@/features/ai/AiFillResultPanel'
import { AiBlockedList } from '@/features/ai/AiFillPicker'
import {
  cellCount,
  gridCards,
  gridSourceKeys,
  pruneGrid,
  toggleCard,
  toggleCardGroup,
  toggleCell,
  toggleGrid,
  toggleSource,
  type AiGrid,
} from '@/features/ai/aiGrid'

/**
 * 'AI 작성하기' 모달 — 카드마다 읽을 자료를 격자에서 고르고 한 번에 실행한다.
 *
 * 자료 목록과 규격(`catalog`)을 **받아서** 쓴다. 목록이 준비된 뒤에 열리는 것을 버튼이
 * 보장한다.
 *
 * 카드의 '작성됨'이 저장된 값이 아니라 **지금 폼에 적힌 값**을 두고 하는 말인 것이 요점이다 —
 * 그 판정은 값을 가진 쪽(카탈로그를 만드는 화면)이 미리 해서 넘긴다.
 *
 * **실행도 결과도 이 창 안에서 일어난다**(2026-09-06 사용자 지정). 종전에는 실행하는 순간
 * 창이 격자를 걷고 스피너만 남겼다가 결과가 오면 창을 닫고 폼 맨 위에 안내를 세웠다. 그러면
 * 담당자는 **자기가 무엇을 골랐는지 확인할 수 없는 채로** 기다렸고, 결과는 방금 누른 자리가
 * 아니라 뒤편 화면에서 떴다. 이제 격자는 흐려질 뿐 자리에 남고(무엇을 돌리는 중인지 보인다),
 * 결과는 아래 패널이 받는다. 창을 닫지 않는 것도 같은 이유다 — 실패한 카드만 남겨 다시
 * 실행하는 것이 결과 직후의 정상 행동인데, 창이 닫히면 격자를 다시 열어야 한다.
 *
 * **폼 맨 위의 배너는 걷었다**(2026-09-06 사용자 지정). 결과가 창 안에 서게 된 뒤로 그것은
 * 같은 말을 두 곳에서 하는 층이었고, 뒤편 화면의 파란 상자가 정작 창 안의 답보다 먼저 눈에
 * 걸렸다. 대가는 창을 닫으면 근거·경고를 다시 볼 수 없다는 것이며, 다시 필요해지면 그때는
 * 배너가 아니라 **창을 다시 여는 길**로 답한다(같은 사실이 두 자리에 살지 않게).
 *
 * **버튼이 둘인 이유는 두 일이 다르기 때문이다**(2026-09-06). 자료 분석은 우리 쪽에서 끝나
 * 밖으로 나가는 것이 없고, AI 작성은 그 자료가 외부 AI로 나간다. 한 버튼 뒤에 두면 담당자는
 * 언제 자료가 밖으로 나가는지 알 수 없다. 겸해서 한 번 분석해 둔 자료는 다시 읽지 않는다.
 *
 * **분석하지 않아도 작성은 된다.** 분석 전 자료는 종전처럼 작성할 때 그 자리에서 읽힌다 —
 * 분석은 막는 문이 아니라 시간을 아끼는 준비다. 대신 몇 건이 그런지를 접지 않고 말한다.
 *
 * **작성의 실행은 한 번이다.** 나누는 일은 서버가 한다 — 같은 자료의 소수 카드는 한 요청,
 * 카드가 많으면 탐색 축별 요청으로 보내고 자료는 조합이 몇 벌이든 한 번만 올린다. 그래서 이
 * 화면에는 묶음이라는 말이 없다.
 *
 * 격자 상태를 위(`AiFillButton`)에서 받는 이유는 **재실행** 때문이다. 한 요청이 실패하면 그
 * 카드만 다시 돌려야 하는데, 창을 닫을 때 선택이 사라지면 처음부터 다시 골라야 한다.
 *
 * 봉투는 그대로 상위로 올린다. 병합은 폼이 자기 살아 있는 값 위에서 하고, 그 결과(`outcome`)를
 * 돌려주면 이 창이 받아 세운다 — 합치는 판단이 두 곳에 살지 않게 한다.
 *
 * 근거: docs/docs_planning/3_3_5_startup_ai_fill.md §4
 */

/**
 * 창 제목 옆 말풍선의 공통 문구.
 *
 * 대상이 무엇이든 같은 말이라 여기 한 번만 적는다 — 대상마다 복사해 두면 규칙이 바뀌는 날
 * 한쪽만 고쳐지고, 그때 어느 쪽이 지금의 규칙인지 화면이 답하지 못한다. 대상별로 덧붙일 말은
 * 카탈로그의 `help`가 갖고 이 문장 앞에 선다.
 */
const COMMON_HELP =
  '카드마다 읽을 자료를 지정하면 그 자료만 근거로 초안을 만듭니다. 카드가 쓰지 않을 자료를 빼면 결과가 정확해집니다 — 재무 카드에 발표 자료가 함께 들어가면 확정 재무 대신 목표 수치를 가져올 수 있습니다. 선택한 자료는 외부 AI(Google Gemini)로 전송되며 반출 기록이 남습니다. 결과는 편집 화면에 채워지고 저장 전까지 원장은 바뀌지 않습니다. 먼저 ‘선택 자료 분석하기’로 자료를 열어 두면 다음 실행부터 같은 자료를 다시 읽지 않고, 원본 대신 뽑아 낸 글자만 외부 AI로 나갑니다. 문서를 눈으로 보듯 이해하는 것은 PDF와 이미지뿐입니다 — 엑셀·워드·파워포인트는 서버가 열어 글자와 표로 바꿔 보내므로 표는 그대로 옮겨지지만, 발표 자료(PPTX)는 그림과 배치가 빠집니다. IR 자료는 PDF로 저장해 올리는 편이 낫습니다.'

export function AiFillModal<K extends string>({
  catalog,
  sources,
  targetId,
  subjectName,
  grid,
  onGrid,
  onClose,
  onFilled,
}: {
  /** 이 대상의 규격 — 카드·묶음·두드릴 함수. */
  catalog: AiFillCatalog<K>
  sources: AiSource[]
  /** 수정 모드의 대상 id. 등록 모드에는 아직 없다. */
  targetId?: string
  /** 프롬프트에 실을 대상의 이름. */
  subjectName?: string
  grid: AiGrid<K>
  onGrid: (next: AiGrid<K>) => void
  onClose: () => void
  /** 폼에 초안을 얹고 **그 결과**를 돌려준다. 창은 그것을 아래 패널에 세운다. */
  onFilled: (result: AiFillResult<K>, cards: K[]) => AiFillOutcome<K>
}) {
  const fill = useAiFill<K>()
  const [error, setError] = useState<string | null>(null)
  const [outcome, setOutcome] = useState<AiFillOutcome<K> | null>(null)
  const extracts = useAiExtracts(catalog.extractEndpoint, sources, targetId)

  const allCardKeys = useMemo(() => cardKeysOf(catalog.cards), [catalog.cards])
  const cardLabel = useMemo(() => cardLabelMap(catalog.cards), [catalog.cards])

  /**
   * 결과 패널로 데려간다.
   *
   * 결과가 서는 자리는 격자 아래라, 자료가 많으면 창 본문이 스크롤되어 **결과가 접힌 화면
   * 밖에서 뜬다**. 실행을 누른 사람은 스피너를 보던 자리(격자)를 계속 보고 있으므로, 답이
   * 어디에 섰는지 화면이 데려가지 않으면 아무 일도 일어나지 않은 것처럼 읽힌다.
   */
  const resultRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (outcome)
      resultRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      })
  }, [outcome])

  const readable = useMemo(() => sources.filter((s) => s.readable), [sources])
  const blocked = sources.filter((s) => !s.readable)
  const allKeys = useMemo(() => readable.map((s) => s.key), [readable])

  // 자료가 바뀌었을 수 있다(실행 뒤 첨부를 지우거나 더한 경우). 없는 자료를 가리키는 칸을
  // 걷지 않으면 카드 열의 건수가 거짓을 말한다 — 3건이라 적혀 있는데 읽는 것은 둘이다.
  const live = useMemo(() => pruneGrid(grid, allKeys, allCardKeys), [grid, allKeys, allCardKeys])

  const cards = gridCards(live, allCardKeys)
  const chosenKeys = new Set(gridSourceKeys(live, allCardKeys))
  const chosen = readable.filter((s) => chosenKeys.has(s.key))
  // 자료는 카드가 몇이든 **한 번만** 올라가므로 크기도 한 번만 센다.
  const totalBytes = chosen.reduce((sum, s) => sum + Number(s.bytes ?? 0), 0)
  const tooLarge = totalBytes > AI_FILL_LIMITS.maxTotalBytes
  // 합계와 별개로 한 건이 큰 경우를 따로 본다 — 합계만 말하면 어느 자료를 빼야 하는지 모른다.
  const oversized = chosen.filter((s) => Number(s.bytes ?? 0) > AI_FILL_LIMITS.maxSingleBytes)
  const busy = fill.isPending
  const ready = cards.length > 0 && !tooLarge && oversized.length === 0 && !busy && !extracts.busy

  // 고른 자료의 분석 상태. 실행 버튼의 이름과 안내가 이 둘로 갈린다.
  const statuses = chosen.map((s) => extracts.statusOf(s))
  const { usable, pending } = writableCount(statuses)
  const analyzable = chosen.filter((s) => extracts.statusOf(s).analyzable)

  // 켜진 카드 중 이미 값이 있는 것 — 무엇이 바뀌는지는 줄마다가 아니라 여기서 한 번 말한다
  // (줄마다 세우면 같은 경고가 카드 수만큼 서서 정작 어느 카드인지가 그 문장에 묻힌다).
  const overwritten = catalog.cards.filter((c) => cards.includes(c.key) && c.filled)

  const run = async () => {
    setError(null)
    // 지난 결과는 실행과 함께 걷는다 — 돌고 있는 스피너 아래에 옛 답이 남아 있으면 그것이
    // 이번 실행의 답으로 읽힌다.
    setOutcome(null)
    try {
      const result = await fill.mutateAsync({
        endpoint: catalog.fillEndpoint,
        targetId,
        subjectName,
        sources: chosen,
        cards,
        assignments: live,
        // 등록 모드에서 이미 분석된 자료의 글자. 수정 모드는 서버가 캐시 원장에서 직접 읽으므로
        // 여기에 담기지 않는다(같은 값을 두 길로 보내지 않는다).
        extracts: extracts.pendingExtracts,
      })
      setOutcome(onFilled(result, cards))
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
      help={catalog.help ? `${catalog.help} ${COMMON_HELP}` : COMMON_HELP}
      footer={
        <div className="flex items-center justify-end gap-2">
          {/* 결과가 서기 전까지는 창을 접는 것이 취소이고, 결과가 선 뒤에는 값이 이미 폼에
              들어가 있으므로 같은 버튼이 '닫기'가 된다. */}
          <Button
            variant={outcome ? 'primary' : 'ghost'}
            onClick={onClose}
            disabled={busy || extracts.busy}
          >
            {outcome ? '닫기' : '취소'}
          </Button>
          {/* 분석과 작성은 다른 일이라 버튼도 둘이다 — 분석은 우리 쪽에서 끝나고, 작성은
              자료가 외부 AI로 나간다. 한 버튼 뒤에 두면 언제 밖으로 나가는지 알 수 없다. */}
          {(analyzable.length > 0 || extracts.busy) && (
            <Button
              variant="outline"
              onClick={() => void extracts.analyze(chosen)}
              disabled={busy || extracts.busy}
            >
              {extracts.progress
                ? `분석 중 (${extracts.progress.done}/${extracts.progress.total})`
                : `선택 자료 분석하기 (${analyzable.length}건)`}
            </Button>
          )}
          <Button variant={outcome ? 'outline' : 'primary'} onClick={run} disabled={!ready}>
            {busy
              ? '작성 중…'
              : outcome
                ? `${cards.length}개 카드 다시 작성`
                : usable > 0 && pending === 0
                  ? `분석된 자료로 ${cards.length}개 카드 작성`
                  : `선택한 ${cards.length}개 카드 작성`}
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        {error && <Banner tone="danger">{error}</Banner>}

        {/* 실행 중에도 격자는 자리에 남고 흐려질 뿐이다 — 무엇을 고른 채로 기다리는지 보여야
            한다. 스피너는 그 위에 얹고, 조작은 겹친 층이 아니라 격자 쪽에서 막는다
            (`pointer-events-none`). */}
        <div className="relative">
          <div
            className={cn(busy && 'pointer-events-none select-none opacity-60 blur-[2px]')}
            aria-busy={busy}
          >
            <AiFillGrid
              sources={readable}
              cards={catalog.cards}
              groups={catalog.groups}
              grid={live}
              onCell={(card, key) => onGrid(toggleCell(live, card, key))}
              onCard={(card) => onGrid(toggleCard(live, card, allKeys))}
              onGroup={(groupCards) => onGrid(toggleCardGroup(live, groupCards, allKeys))}
              onSource={(key) => onGrid(toggleSource(live, key, allCardKeys))}
              onAll={() => onGrid(toggleGrid(live, allCardKeys, allKeys))}
              extracts={extracts}
            />
          </div>
          {busy && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-radius-md bg-white/70">
              <Spinner />
              {/* 서버가 한 번의 응답이라 진척값이 없다. 없는 단계를 지어내지 않는다. */}
              <p className={cardText.value}>
                선택한 자료 {chosen.length}건에서 {cards.length}개 카드를 작성하고 있습니다.
              </p>
              <p className={cardText.meta}>자료 크기에 따라 1~2분이 걸릴 수 있습니다.</p>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <p className={cardText.meta}>
            카드 {cards.length}개 · 자료 {chosen.length}건 · 합계 {formatBytes(totalBytes)}
          </p>
          <p className={cardText.meta}>선택한 칸 {cellCount(live, allCardKeys)}개</p>
        </div>

        {extracts.error && <Banner tone="warning">{extracts.error}</Banner>}

        {/* 분석하지 않은 자료가 있어도 작성은 된다 — 그 자료는 작성할 때 그 자리에서
            읽힌다(종전 동작). 다만 시간이 더 걸리므로 그 사실을 접지 않고 말한다. */}
        {pending > 0 && (
          <p className="text-caption text-gray-600">
            {pending}건은 아직 분석 전입니다. 그대로 작성하면 그 자료는 작성할 때 읽어 시간이 더
            걸립니다. 한 번 분석해 두면 다음 실행부터 다시 읽지 않습니다.
          </p>
        )}

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
            현재 값이 AI 결과로 바뀝니다: {overwritten.map((c) => c.label).join(' · ')}. 저장
            전까지는 되돌릴 수 있습니다.
          </p>
        )}

        <AiBlockedList sources={blocked} />

        {/* 실행 전에는 사용 방법, 실행 뒤에는 결과 — 한 자리를 두 내용이 이어 쓴다. */}
        <div ref={resultRef}>
          <AiFillResultPanel outcome={outcome} cardLabel={cardLabel} />
        </div>
      </div>
    </Modal>
  )
}
