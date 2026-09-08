/**
 * 'AI 작성하기' 응답 봉투와 실행 결과 — **대상이 무엇이든 같은 모양**인 것들.
 *
 * 이 파일이 프론트 쪽 재사용 경계다. 서버가 이미 같은 선을 그어 두었다 — 자료를 모으고,
 * 예산을 재고, 요청을 나누고, 근거를 대조하는 일은 엔진(`_shared/aiFill`)이 하고, 카드 목록과
 * 규격만 대상별 프로파일이 갖는다. 화면도 같다: 격자·모달·결과 패널이 하는 일은 대상이
 * 스타트업이든 M&A 셀러든 똑같고, 갈리는 것은 **카드가 몇이고 무엇인가** 하나뿐이다.
 *
 * 그래서 여기 있는 타입은 전부 카드 키 `K`로 열려 있다. 종전에는 이 모양들이
 * `startupAiMerge.ts` 안에서 `AiCardKey`로 못 박혀 있었고, 그 한 줄 때문에 창·격자·결과
 * 패널까지 통째로 스타트업 전용이었다.
 *
 * 근거: docs/docs_planning/3_3_5_startup_ai_fill.md §4.4·§16.16
 */

/**
 * 서버가 대조를 마친 근거 한 줄.
 *
 * **파일명과 자리는 모델이 아니라 서버가 붙인 값이다.** 모델은 자기가 본 조각의 id만 돌려주고,
 * 서버가 그 id를 이번 요청의 지도에서 되짚어 이 모양으로 세운다 — 모델이 위치를 직접 적으면
 * 그 문자열이 실제 자리인지 물어볼 대상이 없다.
 */
export interface AiEvidence {
  /**
   * 원문에서 확인했는가.
   *
   * 거짓이면 우리가 열지 않은 자료(PDF·이미지)를 가리킨 것이다 — 대조할 글자가 우리에게
   * 없다는 뜻이지 지어냈다는 뜻이 아니다. 지어낸 근거는 서버가 이미 떼어 냈고, 뗀 건수는
   * 그 카드의 경고 한 줄이 말한다.
   */
  verified: boolean
  fileName: string
  /** 조각의 자리(`시트: 손익`). 자료 전체를 가리킨 근거에서는 빈 문자열이다. */
  location: string
  quote: string | null
  attachmentId: string | null
}

/** 실패한 요청이 맡고 있던 카드와 그 사유. */
export interface AiFailedCards<K extends string> {
  keys: K[]
  message: string
}

/** Edge Function 응답 봉투. cards의 값 모양은 카드마다 다르므로 unknown으로 받고 대상이 읽는다. */
export interface AiFillEnvelope<K extends string> {
  cards: Partial<Record<K, unknown>>
  notes: Partial<Record<K, string[]>>
  evidence: Partial<Record<K, AiEvidence[]>>
  /**
   * 읽지 못한 자료의 사유(주로 링크). 서버가 건별로 돌려주며, 실행을 멈추지 않고 결과와 함께
   * 알린다 — 다섯 중 하나가 비공개라고 나머지 넷까지 못 읽을 이유가 없고, 담당자가 고칠 수
   * 있는 문제라 조용히 빠뜨리면 왜 초안이 부실한지 알 수 없다.
   */
  skippedSources?: string[]
  /**
   * 요청이 실패해 작성하지 못한 카드.
   *
   * 서버가 카드를 여러 요청으로 나눠 보내므로 일부만 실패할 수 있다. **"못 찾았다"와 다른
   * 축이다** — 못 찾은 것은 모델이 자료를 읽고 근거가 없다고 답한 것이고, 여기 있는 것은
   * 아예 묻지 못한 것이다. 둘을 같이 말하면 담당자가 "자료에 없구나"로 읽고 다시 시도하지
   * 않는다.
   */
  failedCards?: AiFailedCards<K>[]
  /**
   * 문장 다듬기(2단계 작문 패스)를 하지 못한 사유.
   *
   * **실패가 아니라 알림이다.** 값은 1단계에서 이미 채워져 손에 있고, 못 한 것은 그것을 문장으로
   * 세우는 일뿐이다. 그래서 `failedCards`와 같은 자리에 두지 않는다 — 저쪽은 카드가 통째로 비어
   * 다시 눌러야 하는 일이고, 이쪽은 값이 다 있는데 문체가 거친 것이다. 두 축을 뭉치면 담당자가
   * 멀쩡한 초안을 버리고 다시 실행한다.
   */
  composeFailed?: string | null
}

/** 실행 결과 — 창 안 결과 패널이 읽는다. */
export interface AiFillOutcome<K extends string> {
  /** 실제로 값이 채워진 카드. */
  filled: K[]
  /** 체크했으나 자료에 근거가 없어 비워 둔 카드(기존 값 유지). */
  skipped: K[]
  /** 요청이 실패해 아예 묻지 못한 카드(기존 값 유지). 다시 시도하면 될 수 있다. */
  failed: AiFailedCards<K>[]
  notes: Partial<Record<K, string[]>>
  evidence: Partial<Record<K, AiEvidence[]>>
  /** 읽지 못한 자료의 사유. 봉투에서 그대로 넘어온다. */
  skippedSources: string[]
  /** 문장을 다듬지 못한 사유. 값은 채워졌으므로 다시 실행하지 않아도 된다. */
  composeFailed?: string | null
}

/**
 * 요약 줄 문구 — 무엇이 채워졌고 무엇이 그대로인지 한 줄로 말한다.
 *
 * **셋을 갈라 말한다.** 채운 카드, 자료에 근거가 없어 그대로 둔 카드, 요청이 실패해 아예 묻지
 * 못한 카드다. 뒤의 둘을 뭉치면 담당자는 실패한 카드까지 "자료에 없구나"로 읽고 다시 시도하지
 * 않는다 — 그 카드는 다시 누르면 채워질 수 있다.
 *
 * 카드 이름은 인자로 받는다. 이 문장은 대상이 무엇이든 같고 이름만 갈리므로, 여기서 목록을
 * 들면 그 순간 이 함수가 한 대상의 것이 된다.
 */
export function outcomeSummary<K extends string>(
  outcome: AiFillOutcome<K>,
  cardLabel: Record<K, string>,
): string {
  const labels = (keys: K[]) => keys.map((k) => cardLabel[k]).join(' · ')
  const failedKeys = outcome.failed.flatMap((f) => f.keys)
  const total = outcome.filled.length + outcome.skipped.length + failedKeys.length
  const head =
    outcome.filled.length > 0
      ? `${total}개 중 ${outcome.filled.length}개 카드를 작성했습니다: ${labels(outcome.filled)}.`
      : '작성된 카드가 없습니다.'

  const parts = [head]
  if (failedKeys.length > 0) {
    // 사유는 묶음마다 다를 수 있어 함께 세운다(같은 사유면 한 번만 서도록 중복을 걷는다).
    const reasons = [...new Set(outcome.failed.map((f) => f.message))].join(' / ')
    parts.push(`작성하지 못한 카드: ${labels(failedKeys)} — ${reasons}`)
  }
  if (outcome.skipped.length > 0) {
    parts.push(`자료에서 찾지 못해 그대로 둔 카드: ${labels(outcome.skipped)}.`)
  }
  parts.push('확인 후 저장하세요.')
  return parts.join(' ')
}
