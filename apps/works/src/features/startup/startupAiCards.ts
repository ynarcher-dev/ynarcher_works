import type { EntityRow } from '@/features/master/entityHooks'
import { readGrowth, readBusinessStatus } from '@/features/startup/startupGrowth'
import { readBusiness, readIp, readTeam, readTech } from '@/features/startup/startupProfile'
import { readShareholderHistory } from '@/features/startup/startupShareholders'

/**
 * 'AI 작성하기'의 체크 단위 — 상세 카드 10종.
 *
 * 체크 단위를 카드로 잡은 이유는 저장 단위와 같기 때문이다. 저장이 **카드 하나에 컬럼 하나**
 * (통째 교체)라, 체크되지 않은 카드는 그 컬럼을 건드리지 않으면 그만이다. 필드 단위로 잘게
 * 쪼개면 담당자가 열 몇 칸을 매번 훑어야 하고, 밴드 단위로 뭉치면 손으로 다듬어 둔 카드 하나
 * 때문에 밴드 전체를 포기하게 된다.
 *
 * 근거: docs/docs_planning/3_3_5_startup_ai_fill.md §5
 */

/** 카드 키. Edge Function(supabase/functions/startup-ai-fill/cards.ts)의 목록과 한 벌이다. */
export const AI_CARD_KEYS = [
  'business',
  'tech',
  'team',
  'ip',
  'timeline',
  'traction',
  'revenue',
  'employee',
  'shareholders',
  'investment',
] as const

export type AiCardKey = (typeof AI_CARD_KEYS)[number]

/** 밴드 — 상세 화면의 세로 축(다시 재는가). 모달의 카드 목록도 같은 순서로 선다. */
export type AiCardBand = '역량' | '실적'

export interface AiCardMeta {
  key: AiCardKey
  label: string
  band: AiCardBand
  /** 현재 이 카드에 값이 있는가. 기본 체크 상태와 '작성됨' 표기를 함께 정한다. */
  filled: (record: EntityRow) => boolean
  /** 목록형 카드의 현재 건수(없으면 null). '작성됨 · 3건'의 뒷자리. */
  count?: (record: EntityRow) => number
}

const some = (...values: unknown[]) => values.some((v) => (typeof v === 'string' ? v.trim() !== '' : Boolean(v)))

/**
 * 카드 정의. `filled`는 "AI가 덮어쓸 것이 있는가"를 답한다 — 하나라도 값이 있으면 채워진
 * 카드로 보고 기본 체크를 끈다. 절반만 찬 카드를 빈 카드로 취급하면, 담당자가 손으로 적은
 * 그 절반이 기본값 그대로 실행했을 때 사라진다.
 */
export const AI_CARDS: AiCardMeta[] = [
  {
    key: 'business',
    label: '비즈니스',
    band: '역량',
    filled: (r) => {
      const b = readBusiness(r)
      return some(b.oneLiner, b.businessModel, b.targetMarket, b.revenueModel, b.salesChannel, b.supplyMode)
    },
  },
  {
    key: 'tech',
    label: '제품·기술',
    band: '역량',
    filled: (r) => {
      const t = readTech(r)
      return some(t.product, t.devStage, t.coreTech, t.devInsourcing, t.differentiator)
    },
  },
  {
    key: 'team',
    label: '팀·조직',
    band: '역량',
    filled: (r) => {
      const t = readTeam(r)
      return some(
        t.founderStrength,
        t.orgComposition,
        t.hiringPlan,
        t.members?.length,
        t.advisors?.length,
        t.capabilities?.length,
      )
    },
  },
  {
    key: 'ip',
    label: '지식재산·인증',
    band: '역량',
    filled: (r) => {
      const ip = readIp(r)
      return ip.rights.length + ip.certifications.length + ip.govProjects.length > 0
    },
    count: (r) => {
      const ip = readIp(r)
      return ip.rights.length + ip.certifications.length + ip.govProjects.length
    },
  },
  {
    key: 'timeline',
    label: '연혁',
    band: '실적',
    filled: (r) => readBusinessStatus(r).length > 0,
    count: (r) => readBusinessStatus(r).length,
  },
  {
    key: 'traction',
    label: '트랙션·고객',
    band: '실적',
    filled: (r) => {
      const g = readGrowth(r)
      return g.traction.length + g.customers.length > 0
    },
    count: (r) => {
      const g = readGrowth(r)
      return g.traction.length + g.customers.length
    },
  },
  {
    key: 'revenue',
    label: '매출·재무',
    band: '실적',
    filled: (r) => {
      const g = readGrowth(r)
      return g.revenue.length + g.finance.length > 0
    },
    count: (r) => {
      const g = readGrowth(r)
      return g.revenue.length + g.finance.length
    },
  },
  {
    key: 'employee',
    label: '고용',
    band: '실적',
    filled: (r) => readGrowth(r).employee.length > 0,
    count: (r) => readGrowth(r).employee.length,
  },
  {
    key: 'shareholders',
    label: '주주',
    band: '실적',
    filled: (r) => readShareholderHistory(r).length > 0,
    count: (r) => readShareholderHistory(r).length,
  },
  {
    key: 'investment',
    label: '투자',
    band: '실적',
    filled: (r) => readGrowth(r).investment.length > 0,
    count: (r) => readGrowth(r).investment.length,
  },
]

/** 카드 키 → 라벨(요약 줄·경고에서 카드를 부르는 말). */
export const AI_CARD_LABEL: Record<AiCardKey, string> = AI_CARDS.reduce(
  (acc, c) => ({ ...acc, [c.key]: c.label }),
  {} as Record<AiCardKey, string>,
)

/**
 * 기본 체크 상태 — **빈 카드는 켜고, 값이 있는 카드는 끈다.**
 *
 * 이 기본값이 이 기능의 안전장치다. 첫 작성은 한 번에 되고, 두 번째 갱신에서는 손으로 다듬어
 * 둔 카드가 기본값에서부터 덮어쓰기 대상에서 빠진다. 체크박스를 둔 이유가 "무엇을 쓸까"가
 * 아니라 "무엇을 지킬까"이므로, 기본값도 지키는 쪽에 서야 한다.
 */
export function defaultCardSelection(record: EntityRow): AiCardKey[] {
  return AI_CARDS.filter((c) => !c.filled(record)).map((c) => c.key)
}
