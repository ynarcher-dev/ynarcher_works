/**
 * 'AI 작성하기'가 **대상에게 물어보는 것 전부** — 카드 목록·묶음·엔드포인트.
 *
 * 화면 쪽 재사용 경계다. 서버가 그은 선(*무엇을 뽑는가*는 프로파일, *어떻게 뽑는가*는 엔진)을
 * 화면에도 그대로 긋는다 — 격자를 그리고, 자료를 분석하고, 요청을 보내고, 결과를 세우는 일은
 * 대상이 무엇이든 같고, 갈리는 것은 이 인터페이스에 담긴 것뿐이다.
 *
 * **`filled`·`count`가 함수가 아니라 값인 것이 요점이다.** 종전에는 카드마다
 * `filled: (record: EntityRow) => boolean`을 들고 창·격자가 스타트업 원장 행(`snapshot`)을
 * 함께 받아 호출했다. 그 한 줄 때문에 두 컴포넌트가 스타트업 원장의 모양을 알아야 했고,
 * 다른 대상은 자기 값을 EntityRow인 척 꾸며야 했다. 지금은 **소유자가 자기 값으로 미리
 * 판정해** 값으로 넘긴다 — 무엇이 채워졌는지는 그 값을 가진 쪽만 답할 수 있는 물음이다.
 *
 * 근거: docs/docs_planning/3_3_5_startup_ai_fill.md §5·§16.16
 */

/** 격자 열 하나 — 체크 단위인 카드. */
export interface AiCardMeta<K extends string> {
  key: K
  /** 열 머리·경고·결과에서 이 카드를 부르는 말. 한 곳에서만 적는다. */
  label: string
  /** 서버가 한 요청에 함께 맡기는 탐색 묶음의 키. 격자 1단 머리가 이것으로 묶인다. */
  group: string
  /**
   * 지금 이 카드에 값이 있는가 — "AI가 덮어쓸 것이 있는가"의 답이다.
   *
   * 하나라도 값이 있으면 채워진 것으로 본다. 절반만 찬 카드를 빈 카드로 세지 않는 것이
   * 요점이다 — 그 절반은 담당자가 손으로 적은 것이고, 이 카드를 켜면 그것까지 함께 바뀐다.
   */
  filled: boolean
  /** 목록형 카드의 현재 건수(없으면 생략). */
  count?: number
}

/** 격자 1단 머리 — 서버가 실제로 나눠 읽는 탐색 묶음. */
export interface AiCardGroupMeta {
  key: string
  label: string
}

/**
 * 한 대상의 AI 작성 규격(화면 쪽).
 *
 * **함수 이름을 카탈로그가 든다.** 서버는 대상마다 얇은 함수를 따로 두므로(권한을 묻는 함수가
 * 대상마다 다르고, 함수 이름이 곧 감사 로그와 배포의 경계다) 화면도 어느 문을 두드릴지를
 * 대상에게 물어야 한다.
 */
export interface AiFillCatalog<K extends string> {
  /** 초안을 만드는 Edge Function 이름. */
  fillEndpoint: string
  /** 자료를 미리 열어 두는 Edge Function 이름(자료 분석). */
  extractEndpoint: string
  /** 화면 순서대로. 요청 순서도 이 목록이 정한다 — 체크한 차례로 세우면 같은 조합이 다른 요청이 된다. */
  cards: AiCardMeta<K>[]
  groups: AiCardGroupMeta[]
  /** 창 제목 옆 말풍선에 대상마다 덧붙는 한 문장(없으면 공통 문구만 선다). */
  help?: string
}

/** 카드 키 → 라벨. 결과·근거·경고가 카드를 부를 때 읽는다. */
export function cardLabelMap<K extends string>(cards: AiCardMeta<K>[]): Record<K, string> {
  return cards.reduce((acc, c) => ({ ...acc, [c.key]: c.label }), {} as Record<K, string>)
}

/** 카드 키만. 격자·토글이 "카드 전부"를 말할 때 읽는다. */
export function cardKeysOf<K extends string>(cards: AiCardMeta<K>[]): K[] {
  return cards.map((c) => c.key)
}
