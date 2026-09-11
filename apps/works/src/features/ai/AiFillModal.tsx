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
import { useAiExtracts } from '@/features/ai/useAiExtracts'
import {
  defaultPlacements,
  moveAll,
  moveSource,
  pruneReadSet,
  splitSources,
  type AiReadSet,
} from '@/features/ai/aiReadSet'
import { AiCardPicker } from '@/features/ai/AiCardPicker'
import { AiSourcePanes } from '@/features/ai/AiSourcePanes'
import { AiFillResultPanel } from '@/features/ai/AiFillResultPanel'
import { AiBlockedList } from '@/features/ai/AiFillPicker'

/**
 * 'AI 작성하기' 모달 — **읽을 자료 한 벌**과 **작성할 카드**를 고르고 한 번에 실행한다.
 *
 * **좌우 두 기둥이다** — 왼쪽은 자료(위: 읽을 자료 / 아래: 읽지 않을 자료), 오른쪽은 작성할
 * 카드다(2026-09-09 사용자 지정). 기둥 비는 격자 시절 그대로 자료 42 : 카드 58이고, 바뀐 것은
 * 왼쪽이 자료 열 넷에서 위아래 두 칸이 된 것뿐이라 같은 화면을 쓰던 눈이 자리를 다시 익히지
 * 않아도 된다. 세로로 이어 쌓지 않는 것은 자료와 카드가 **같은 한 번의 실행에 들어가는 두
 * 답**이라, 스크롤로 갈라 놓으면 실행 버튼을 누를 때 위쪽 답이 화면 밖에 있기 때문이다.
 *
 * **창은 `3xl`이고 본문은 `sectioned`다.** `sectioned`는 본문이 카드 셋으로 갈리기 때문이다
 * (묶음이 둘 이상이면 켠다) — 흰 바닥에 흰 상자가 서면 테두리 한 줄로 구획을 버텨야 한다.
 *
 * 폭은 하루 사이에 3xl → 2xl → 3xl로 두 번 움직였고 **마지막 값이 사용자 지정**이다(2026-09-09).
 * 규격상 `3xl`은 **열 수가 데이터인 표**를 품는 단계이고(5_component_spec §3.5) 격자를 걷은 이
 * 창은 그 조건에 맞지 않아 한 번 `2xl`로 내렸으나, 실물에서 왼쪽 파일 이름과 오른쪽 카드 이름이
 * 함께 서지 못했다 — 그 폭에서 줄어드는 것이 여백이 아니라 **읽히는 이름**이었고, 그것은 규격이
 * `3xl`을 가른 근거와 같은 성격의 손해다. 다만 이때 화면을 실제로 깨뜨린 것은 폭이 아니라
 * 아래 격자의 최소 폭 규칙이었다(그 주석 참조) — 폭을 넓히는 것만으로는 고쳐지지 않았다.
 *
 * 2026-09-09 개정으로 카드×자료 격자를 걷었다. 격자는 "어느 자료가 어느 카드의 근거인가"를
 * 물었는데, 그 답이 카드마다 갈리면 서버는 자료 조합마다 요청을 갈라 같은 자료를 여러 번
 * 읽혔고(토큰 과다), 담당자는 열넷×열둘을 매번 훑어야 했다. 지금 묻는 것은 둘뿐이다 —
 * 무엇을 읽는가(상 칸), 무엇을 쓰는가(카드 체크). 모든 카드가 같은 자료를 함께 읽고, 재무
 * 카드가 IR의 목표치를 집어 오는 일은 자료를 빼는 대신 **종류 꼬리표**가 막는다(서버가 파일명
 * 판정을 프롬프트에 함께 싣는다).
 *
 * **PDF·이미지는 원본 그대로 보낸다**(2026-09-09 사용자 결정 — '눈으로 보기'). 모델이 쪽을
 * 사진처럼 보므로 표·차트가 원본대로 읽히고 스캔본도 따로 처리할 것이 없다. 글자로 뽑는 것은
 * 모델이 받지 못하는 오피스·한글 파일뿐이고, 그 일은 창이 열릴 때 서버가 알아서 한다 —
 * 종전의 '선택 자료 분석하기' 버튼은 걷었다(담당자가 누를 이유가 없는 준비 단계였다).
 *
 * **실행도 결과도 이 창 안에서 일어난다**(2026-09-06 사용자 지정 유지). 실행 중에는 고른 것이
 * 흐려질 뿐 자리에 남고, 결과는 아래 패널이 받는다. 창을 닫지 않는 것도 같은 이유다 — 실패한
 * 카드만 남겨 다시 실행하는 것이 결과 직후의 정상 행동이다.
 *
 * 배치와 카드 선택을 위(`AiFillButton`)에서 받는 이유는 **재실행** 때문이다. 창을 닫을 때
 * 선택이 사라지면 처음부터 다시 골라야 한다.
 *
 * 봉투는 그대로 상위로 올린다. 병합은 폼이 자기 살아 있는 값 위에서 하고, 그 결과(`outcome`)를
 * 돌려주면 이 창이 받아 세운다 — 합치는 판단이 두 곳에 살지 않게 한다.
 *
 * 근거: docs/docs_planning/3_3_7_ai_fill_visual_read.md §4
 */

/**
 * 창 제목 옆 말풍선의 공통 문구.
 *
 * 대상이 무엇이든 같은 말이라 여기 한 번만 적는다 — 대상마다 복사해 두면 규칙이 바뀌는 날
 * 한쪽만 고쳐지고, 그때 어느 쪽이 지금의 규칙인지 화면이 답하지 못한다. 대상별로 덧붙일 말은
 * 카탈로그의 `help`가 갖고 이 문장 앞에 선다.
 */
const COMMON_HELP =
  '왼쪽 위 칸(읽을 자료)의 자료만 외부 AI(Google Gemini)로 전송되며 반출 기록이 남습니다. 파일명으로 종류를 알 수 있는 자료(IR·회사소개서·재무제표·손익계산서·감사보고서·인증서 등)는 처음부터 위 칸에 서고 나머지는 아래 칸에 섭니다 — 줄을 눌러 옮길 수 있습니다. 읽을 자료가 적을수록 초안이 정확해집니다. PDF·이미지는 원본 그대로 보내 모델이 눈으로 보듯 읽고(스캔본도 됩니다), 엑셀·워드·파워포인트·한글(HWPX)은 서버가 글자와 표로 바꿔 보내므로 그림과 배치가 빠집니다 — IR 자료는 PDF로 저장해 올리는 편이 낫습니다. 결과는 편집 화면에 채워지고 저장 전까지 원장은 바뀌지 않습니다.'

export function AiFillModal<K extends string>({
  catalog,
  sources,
  targetId,
  linkId,
  subjectName,
  readSet,
  onReadSet,
  cards,
  onCards,
  onClose,
  onFilled,
}: {
  /** 이 대상의 규격 — 카드·묶음·두드릴 함수. */
  catalog: AiFillCatalog<K>
  sources: AiSource[]
  /** 수정 모드의 대상 id. 등록 모드에는 아직 없다. */
  targetId?: string
  /**
   * 등록 모드에서 폼이 방금 고른 참조 연결(스타트업 id 등).
   *
   * 대상 행이 아직 없으므로 참조의 소속을 서버가 저장된 값에서 찾을 수 없다. 이 값을 함께
   * 보내면 같은 방향 함수가 판정한다 — 열람 자격은 여전히 그 원장의 RLS가 본다.
   */
  linkId?: string | null
  /** 프롬프트에 실을 대상의 이름. */
  subjectName?: string
  /** 담당자가 옮긴 자료의 자리(기본값과 다른 줄만). */
  readSet: AiReadSet
  onReadSet: (next: AiReadSet) => void
  /** 작성할 카드. */
  cards: K[]
  onCards: (next: K[]) => void
  onClose: () => void
  /** 폼에 초안을 얹고 **그 결과**를 돌려준다. 창은 그것을 아래 패널에 세운다. */
  onFilled: (result: AiFillResult<K>, cards: K[]) => AiFillOutcome<K>
}) {
  const fill = useAiFill<K>()
  const [error, setError] = useState<string | null>(null)
  const [outcome, setOutcome] = useState<AiFillOutcome<K> | null>(null)
  const fillAbortRef = useRef<AbortController | null>(null)
  /**
   * 지금 이 창이 작성을 돌리고 있는가.
   *
   * **뮤테이션의 `isPending`을 그대로 쓰지 않는다**(2026-09-09 수정). 결과가 이미 아래 서 있는데도
   * 스피너가 남는 일이 실제로 났다. 스피너를 세우고 걷는 일은 **이 창이 시작한 실행 하나**에
   * 매여야 하므로 시작할 때 켜고 `finally`에서 끄는 플래그를 이 창이 직접 든다 — 성공·실패·예외
   * 어느 길로 빠져나가도 반드시 꺼진다. 남의 상태를 읽어 내 화면을 세우면, 그 값이 언제
   * 참이 되는지를 이 창이 답할 수 없다.
   */
  const [running, setRunning] = useState(false)

  useEffect(() => {
    return () => fillAbortRef.current?.abort()
  }, [])

  const allCardKeys = useMemo(() => cardKeysOf(catalog.cards), [catalog.cards])
  const cardLabel = useMemo(() => cardLabelMap(catalog.cards), [catalog.cards])

  const readable = useMemo(() => sources.filter((s) => s.readable), [sources])
  const blocked = sources.filter((s) => !s.readable)
  const allKeys = useMemo(() => readable.map((s) => s.key), [readable])

  // 자료가 바뀌었을 수 있다(실행 뒤 첨부를 지우거나 더한 경우). 사라진 자료의 자리를 걷지
  // 않으면 같은 이름의 새 파일이 옛 자리를 물려받는다.
  const live = useMemo(() => pruneReadSet(readSet, allKeys), [readSet, allKeys])
  // 기본 자리는 목록 전체를 보고 정해진다(참조 자료를 내릴지가 자기 자료의 유무에 걸린다).
  const defaults = useMemo(() => defaultPlacements(readable), [readable])
  const { read, skip } = useMemo(() => splitSources(live, defaults, readable), [live, defaults, readable])
  const chosenCards = useMemo(() => allCardKeys.filter((k) => cards.includes(k)), [allCardKeys, cards])

  // 분석 상태는 **읽을 자료**에 대해서만 든다 — 아래 칸의 자료는 열지도 보내지도 않는다.
  const extracts = useAiExtracts(catalog.extractEndpoint, read, targetId, linkId)

  /**
   * 읽을 자료 중 우리가 열어야 하는 것(오피스·한글·링크)은 창이 알아서 연다.
   *
   * 버튼을 두지 않는 이유는 그것이 담당자의 결정이 아니라 준비이기 때문이다 — 열어 두면
   * 작성이 빨라질 뿐 결과가 달라지지 않는다. 한 번에 한 벌씩 열고(같은 작업자를 쓴다), 끝나면
   * 이 효과가 다시 돌아 새로 올라온 줄을 잡는다.
   *
   * **한 번 시도한 자료는 다시 열지 않는다.** 열기에 실패하면 그 줄의 상태가 '분석 전'에
   * 머무는 경우가 있고(서버가 요청을 통째로 거절한 때), 시도한 키를 적어 두지 않으면 이
   * 효과가 끝없이 다시 돌며 같은 요청을 반복한다. 다시 열고 싶으면 창을 다시 연다.
   */
  const tried = useRef<Set<string>>(new Set())
  const readKeys = read.map((s) => s.key).join('|')
  useEffect(() => {
    if (extracts.busy) return
    const todo = read.filter((s) => {
      if (tried.current.has(s.key)) return false
      const st = extracts.statusOf(s)
      return st.state === 'idle' || st.state === 'stale'
    })
    if (todo.length === 0) return
    for (const s of todo) tried.current.add(s.key)
    void extracts.analyze(todo)
    // read 배열은 키 문자열로 대신 본다(같은 줄들이면 새 배열이어도 다시 돌지 않는다).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readKeys, extracts.busy])

  /**
   * 결과 패널로 데려간다.
   *
   * 결과가 서는 자리는 목록 아래라, 자료가 많으면 창 본문이 스크롤되어 **결과가 접힌 화면
   * 밖에서 뜬다**. 실행을 누른 사람은 스피너를 보던 자리를 계속 보고 있으므로, 답이 어디에
   * 섰는지 화면이 데려가지 않으면 아무 일도 일어나지 않은 것처럼 읽힌다.
   */
  const resultRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (outcome) resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [outcome])

  // 자료는 카드가 몇이든 **한 번만** 올라가므로 크기도 한 번만 센다.
  const totalBytes = read.reduce((sum, s) => sum + Number(s.bytes ?? 0), 0)
  const tooLarge = totalBytes > AI_FILL_LIMITS.maxTotalBytes
  // 합계와 별개로 한 건이 큰 경우를 따로 본다 — 합계만 말하면 어느 자료를 빼야 하는지 모른다.
  const oversized = read.filter((s) => Number(s.bytes ?? 0) > AI_FILL_LIMITS.maxSingleBytes)
  const busy = running
  const ready =
    chosenCards.length > 0 && read.length > 0 && !tooLarge && oversized.length === 0 && !busy && !extracts.busy

  // 켜진 카드 중 이미 값이 있는 것 — 무엇이 바뀌는지는 줄마다가 아니라 여기서 한 번 말한다.
  const overwritten = catalog.cards.filter((c) => chosenCards.includes(c.key) && c.filled)

  const toggleCard = (key: K) =>
    onCards(cards.includes(key) ? cards.filter((k) => k !== key) : [...cards, key])
  // 켜진 것이 하나라도 있으면 끄고, 없으면 전부 켠다 — "켜진 것을 끈다"가 언제나 맞는 말이 된다.
  const toggleMany = (keys: K[]) => {
    const anyOn = keys.some((k) => cards.includes(k))
    onCards(anyOn ? cards.filter((k) => !keys.includes(k)) : [...new Set([...cards, ...keys])])
  }

  const run = async () => {
    // 이미 돌고 있으면 아무 일도 하지 않는다. 버튼이 잠기지만 그 사이의 두 번째 클릭까지
    // 막는 것은 이 한 줄이다 — 두 번 나가면 앞선 결과 위에 스피너가 다시 서서, 끝난 실행이
    // 끝나지 않은 것처럼 보인다.
    if (running) return
    setRunning(true)
    setError(null)
    // 지난 결과는 실행과 함께 걷는다 — 돌고 있는 스피너 아래에 옛 답이 남아 있으면 그것이
    // 이번 실행의 답으로 읽힌다.
    setOutcome(null)
    const controller = new AbortController()
    fillAbortRef.current = controller
    try {
      const result = await fill.mutateAsync({
        endpoint: catalog.fillEndpoint,
        targetId,
        linkId,
        subjectName,
        sources: read,
        cards: chosenCards,
        // 등록 모드에서 이미 분석된 자료의 글자. 수정 모드는 서버가 캐시 원장에서 직접 읽으므로
        // 여기에 담기지 않는다(같은 값을 두 길로 보내지 않는다).
        extracts: extracts.pendingExtracts,
        signal: controller.signal,
      })
      setOutcome(onFilled(result, chosenCards))
    } catch (e) {
      if (!controller.signal.aborted) {
        setError(e instanceof Error ? e.message : 'AI 작성에 실패했습니다.')
      }
    } finally {
      if (fillAbortRef.current === controller) fillAbortRef.current = null
      setRunning(false)
    }
  }

  const cancel = () => {
    fillAbortRef.current?.abort()
    onClose()
  }

  return (
    <Modal
      open
      onClose={busy ? () => undefined : onClose}
      // 쓰던 것이 있는 모달이라 딤 클릭으로 닫지 않는다(고른 것이 클릭 한 번에 사라지면 안 된다).
      dismissible={false}
      // **3xl은 규격상 격자를 품는 단계이나 여기서는 사용자 지정으로 쓴다**(2026-09-09).
      // 2xl에서는 왼쪽 파일 이름과 오른쪽 카드 이름이 함께 서지 못했다 — 이름이 잘리는 쪽이
      // 무엇을 고르는지 답하는 값이라, 좁히면 줄어드는 것이 여백이 아니라 읽히는 이름이었다.
      size="3xl"
      // 본문이 카드 셋(읽을 자료·읽지 않을 자료·작성할 카드)으로 갈린다 — 바닥을 페이지
      // 바탕으로 내려 상자의 경계를 선이 아니라 면이 만든다.
      sectioned
      title="AI 작성하기"
      help={catalog.help ? `${catalog.help} ${COMMON_HELP}` : COMMON_HELP}
      footer={
        <div className="flex items-center justify-end gap-2">
          {/* 결과가 서기 전까지는 창을 접는 것이 취소이고, 결과가 선 뒤에는 값이 이미 폼에
              들어가 있으므로 같은 버튼이 '닫기'가 된다. */}
          <Button variant={outcome ? 'primary' : 'ghost'} onClick={outcome ? onClose : cancel}>
            {outcome ? '닫기' : '취소'}
          </Button>
          <Button variant={outcome ? 'outline' : 'primary'} onClick={run} disabled={!ready}>
            {busy
              ? '작성 중…'
              : extracts.busy
                ? '자료를 여는 중…'
                : outcome
                  ? `${chosenCards.length}개 카드 다시 작성`
                  : `선택한 ${chosenCards.length}개 카드 작성`}
          </Button>
        </div>
      }
    >
      {error && <Banner tone="danger">{error}</Banner>}

      {/* 실행 중에도 고른 것은 자리에 남고 흐려질 뿐이다 — 무엇을 고른 채로 기다리는지 보여야
          한다. 스피너는 그 위에 얹고, 조작은 겹친 층이 아니라 안쪽에서 막는다. */}
      <div className="relative">
        {/* 기둥 비는 격자 시절 그대로다(자료 칸 42 : 카드 58) — 바뀐 것은 왼쪽이 열 넷에서
            위아래 두 칸이 된 것뿐이다(2026-09-09 사용자 지정). 좁은 화면에서는 한 기둥으로
            접히고, 그때 자료가 먼저 선다.

            **비율 뒤에 `minmax(0, …)`이 붙는 것이 요점이다.** `42fr`만 적으면 칸의 최소 폭이
            내용의 최소 폭(auto)이 되어, 안에 줄지 않는 값(파일 형식·용량·배지)이 있으면 칸이
            제 몫보다 넓게 버틴다. 그러면 옆 칸이 그만큼 밀려 비율이 깨지고 창 밖으로 넘쳐
            가로 스크롤이 생긴다 — 실제로 그렇게 깨졌다. 0을 최소로 두면 칸이 먼저 줄고,
            줄어드는 일은 이름 쪽의 말줄임이 받는다. */}
        <div
          className={cn(
            'grid gap-3 lg:grid-cols-[minmax(0,42fr)_minmax(0,58fr)]',
            busy && 'pointer-events-none select-none opacity-60 blur-[2px]',
          )}
          aria-busy={busy}
        >
          <AiSourcePanes
            read={read}
            skip={skip}
            extracts={extracts}
            disabled={busy}
            onMove={(s, to) => onReadSet(moveSource(live, defaults, s, to))}
            onMoveAll={(to) => onReadSet(moveAll(live, defaults, to === 'read' ? skip : read, to))}
          />
          <AiCardPicker
            cards={catalog.cards}
            groups={catalog.groups}
            selected={chosenCards}
            disabled={busy}
            onToggle={toggleCard}
            onToggleMany={toggleMany}
          />
        </div>
        {busy && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-radius-md bg-white/70">
            <Spinner />
            {/* 서버가 한 번의 응답이라 진척값이 없다. 없는 단계를 지어내지 않는다. */}
            <p className={cardText.value}>
              읽을 자료 {read.length}건에서 {chosenCards.length}개 카드를 작성하고 있습니다.
            </p>
            <p className={cardText.meta}>자료 크기에 따라 1~2분이 걸릴 수 있습니다.</p>
          </div>
        )}
      </div>

      {/* 세는 값과 막힌 이유를 한 덩이로 붙여 둔다 — 성격이 같고, 흩어 놓으면 바닥의 리듬이
          문장 수만큼 늘어난다. */}
      <div className="space-y-1">
        <p className={cardText.meta}>
          카드 {chosenCards.length}개 · 읽을 자료 {read.length}건 · 합계 {formatBytes(totalBytes)}
        </p>

        {/* 여는 중인 자료가 있으면 실행이 잠시 잠긴다 — 왜 안 눌리는지를 이 줄이 답한다. */}
        {extracts.progress && (
          <p className="text-caption text-gray-600">
            자료를 여는 중입니다 ({extracts.progress.done}/{extracts.progress.total}). 끝나면 실행할 수
            있습니다.
          </p>
        )}

        {/* 막힌 이유는 접지 않는다 — 왜 실행 버튼이 안 눌리는지를 이 줄이 답한다. */}
        {tooLarge && (
          <p className="text-caption text-danger">
            읽을 자료의 합계가 {formatBytes(AI_FILL_LIMITS.maxTotalBytes)}를 넘습니다. 자료를 아래로 내려
            주세요.
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
      </div>

      {extracts.error && <Banner tone="warning">{extracts.error}</Banner>}

      <AiBlockedList sources={blocked} />

      {/* 실행 전에는 사용 방법, 실행 뒤에는 결과 — 한 자리를 두 내용이 이어 쓴다. */}
      <div ref={resultRef}>
        <AiFillResultPanel outcome={outcome} cardLabel={cardLabel} />
      </div>
    </Modal>
  )
}
