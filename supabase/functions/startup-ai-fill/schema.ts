// [AI 작성하기] Gemini 구조화 출력 스키마(responseSchema) 조립.
//
// 스키마를 프롬프트와 같은 폴더에 두되 파일을 나눈 이유는 둘이 서로 다른 것을 강제하기
// 때문이다 — 프롬프트는 **무엇을 적을지**를, 스키마는 **어떤 모양으로 올지**를 정한다.
// 모양이 어긋나면 파싱 단계에서 통째로 실패하므로 스키마는 최대한 느슨하게 잡고
// (거의 모든 칸이 nullable), 값의 옳고 그름은 validate.ts가 뒤에서 따로 거른다.
//
// **고정 선택지를 enum으로 박지 않는다.** 스키마가 선택지를 강제하면 모델은 어느 값에도
// 맞지 않는 문서에서도 가장 가까운 값을 골라 넣게 되고, 그 순간 "모른다"가 "이것이다"로
// 바뀐다. 대신 STRING으로 받아 validate.ts가 목록 밖 값을 null로 치환하고 원문을 notes에
// 남긴다 — 틀린 값을 지어내는 것보다 빈 칸이 낫다는 이 기능의 계약 그대로다.
//
// 근거: docs/docs_planning/3_3_5_startup_ai_fill.md §6.3·§8.2

import { CARD_KEYS, type CardKey } from './cards.ts'

/** Gemini responseSchema 노드(OpenAPI 부분집합). */
interface SchemaNode {
  type: string
  nullable?: boolean
  description?: string
  properties?: Record<string, SchemaNode>
  items?: SchemaNode
  required?: string[]
}

const STR: SchemaNode = { type: 'STRING', nullable: true }
const NUM: SchemaNode = { type: 'NUMBER', nullable: true }
const INT: SchemaNode = { type: 'INTEGER', nullable: true }
const BOOL: SchemaNode = { type: 'BOOLEAN', nullable: true }

/** 이름이 없으면 행 자체가 성립하지 않는 목록에서 그 한 칸만 필수로 세운다. */
function obj(properties: Record<string, SchemaNode>, required: string[] = []): SchemaNode {
  return { type: 'OBJECT', nullable: true, properties, required }
}

function arr(items: SchemaNode): SchemaNode {
  return { type: 'ARRAY', items }
}

const CARD_SCHEMAS: Record<CardKey, SchemaNode> = {
  business: obj({
    oneLiner: STR,
    businessModel: STR,
    targetMarket: STR,
    revenueModel: STR,
    salesChannel: STR,
    supplyMode: STR,
  }),
  tech: obj({
    product: STR,
    devStage: STR,
    coreTech: STR,
    devInsourcing: STR,
    differentiator: STR,
  }),
  team: obj({
    founderStrength: STR,
    orgComposition: STR,
    hiringPlan: STR,
    members: arr(
      obj(
        {
          name: { type: 'STRING' },
          role: STR,
          background: STR,
          employment: STR,
          joinedAt: STR,
          hasEquity: BOOL,
        },
        ['name'],
      ),
    ),
    advisors: arr(obj({ name: { type: 'STRING' }, affiliation: STR, role: STR }, ['name'])),
    capabilities: arr({ type: 'STRING' }),
  }),
  ip: obj({
    rights: arr(obj({ kind: STR, title: { type: 'STRING' }, no: STR, status: STR, date: STR }, ['title'])),
    certifications: arr(obj({ name: { type: 'STRING' }, agency: STR, date: STR }, ['name'])),
    govProjects: arr(obj({ name: { type: 'STRING' }, role: STR, period: STR, amount: NUM }, ['name'])),
  }),
  timeline: arr(obj({ date: { type: 'STRING' }, content: { type: 'STRING' } }, ['date', 'content'])),
  traction: obj({
    traction: arr(
      obj({ metric: { type: 'STRING' }, unit: STR, period: { type: 'STRING' }, value: NUM }, ['metric', 'period']),
    ),
    customers: arr(obj({ name: { type: 'STRING' }, kind: STR, date: STR }, ['name'])),
  }),
  revenue: obj({
    revenue: arr(
      obj({ year: { type: 'INTEGER' }, revenue: NUM, operatingProfit: NUM, netIncome: NUM }, ['year']),
    ),
    finance: arr(obj({ year: { type: 'INTEGER' }, assets: NUM, liabilities: NUM, equity: NUM }, ['year'])),
  }),
  employee: arr(obj({ year: { type: 'INTEGER' }, employeeCount: INT }, ['year'])),
  shareholders: arr(
    obj(
      {
        // 기준일은 "월만 아는" 경우를 빈 문자열로 받으므로 필수이되 nullable이 아니다.
        date: { type: 'STRING' },
        holders: arr(obj({ name: { type: 'STRING' }, shares: NUM, percentage: NUM }, ['name'])),
      },
      ['date', 'holders'],
    ),
  ),
  investment: arr(
    obj({ date: { type: 'STRING' }, round: STR, fundingAmount: NUM, valuation: NUM, investor: STR }, ['date']),
  ),
}

/**
 * 체크된 카드만 담은 봉투 스키마. 고르지 않은 카드를 스키마에 두지 않는 이유는 프롬프트와
 * 같다 — 자리가 있으면 모델은 채우려 하고, 화면이 버릴 값에 근거 탐색을 나눠 쓴다.
 */
export function buildResponseSchema(cards: CardKey[]): SchemaNode {
  const ordered = CARD_KEYS.filter((k) => cards.includes(k))
  const cardProps: Record<string, SchemaNode> = {}
  const noteProps: Record<string, SchemaNode> = {}
  for (const k of ordered) {
    cardProps[k] = CARD_SCHEMAS[k]
    noteProps[k] = arr({ type: 'STRING' })
  }
  return {
    type: 'OBJECT',
    properties: {
      cards: { type: 'OBJECT', properties: cardProps },
      notes: { type: 'OBJECT', properties: noteProps },
      evidence: { type: 'OBJECT', properties: noteProps },
    },
    required: ['cards'],
  }
}
