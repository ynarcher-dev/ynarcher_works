// [AI 작성하기] 구조화 출력 스키마의 봉투 — 카드 안쪽은 프로파일이, 바깥은 엔진이 소유한다.
//
// 가르는 자리가 여기다. `cards`에 무엇이 들어가는지는 대상마다 다르지만(기업 정보·전문가
// 이력·사업 개요), `notes`와 `evidence`는 대상이 무엇이든 같은 일을 한다 — 규격에 못 담은 값을
// 말하고, 어디서 읽었는지를 말한다. 특히 evidence는 우리가 발급한 조각 id로 답해야 하므로
// 프로파일이 모양을 정할 자리가 아니다.
//
// **고정 선택지를 enum으로 박지 않는다**(카드 스키마에서도 같다). 스키마가 선택지를 강제하면
// 어느 값에도 맞지 않는 문서에서도 모델이 가장 가까운 값을 고르게 되고, 그 순간 "모른다"가
// "이것이다"로 바뀐다. 값의 옳고 그름은 스키마가 아니라 정규화가 거른다.
//
// Deno API를 쓰지 않는다(works vitest가 이 조립을 직접 돌린다).
// 근거: docs/docs_planning/3_3_5_startup_ai_fill.md §6.3·§16.15

/** Gemini responseSchema 노드(OpenAPI 부분집합). */
export interface SchemaNode {
  type: string
  nullable?: boolean
  description?: string
  properties?: Record<string, SchemaNode>
  items?: SchemaNode
  required?: string[]
}

export const STR: SchemaNode = { type: 'STRING', nullable: true }
export const NUM: SchemaNode = { type: 'NUMBER', nullable: true }
export const INT: SchemaNode = { type: 'INTEGER', nullable: true }
export const BOOL: SchemaNode = { type: 'BOOLEAN', nullable: true }

/** 이름이 없으면 행 자체가 성립하지 않는 목록에서 그 한 칸만 필수로 세운다. */
export function obj(properties: Record<string, SchemaNode>, required: string[] = []): SchemaNode {
  return { type: 'OBJECT', nullable: true, properties, required }
}

export function arr(items: SchemaNode): SchemaNode {
  return { type: 'ARRAY', items }
}

/** 근거 한 줄의 모양. 자리·파일명이 없는 것이 요점이다 — 그 둘은 서버가 붙인다. */
const EVIDENCE_ITEM: SchemaNode = obj(
  {
    chunkId: { type: 'STRING' },
    quote: STR,
  },
  ['chunkId'],
)

/**
 * 체크된 카드만 담은 봉투 스키마.
 *
 * 고르지 않은 카드를 스키마에 두지 않는 이유는 프롬프트와 같다 — 자리가 있으면 모델은
 * 채우려 하고, 화면이 버릴 값에 근거 탐색을 나눠 쓴다.
 */
export function buildEnvelopeSchema<K extends string>(
  cards: readonly K[],
  cardSchemas: Record<K, SchemaNode>,
): SchemaNode {
  const cardProps: Record<string, SchemaNode> = {}
  const noteProps: Record<string, SchemaNode> = {}
  const evidenceProps: Record<string, SchemaNode> = {}
  for (const k of cards) {
    cardProps[k] = cardSchemas[k]
    noteProps[k] = arr({ type: 'STRING' })
    evidenceProps[k] = arr(EVIDENCE_ITEM)
  }
  return {
    type: 'OBJECT',
    properties: {
      cards: { type: 'OBJECT', properties: cardProps },
      notes: { type: 'OBJECT', properties: noteProps },
      evidence: { type: 'OBJECT', properties: evidenceProps },
    },
    required: ['cards'],
  }
}
