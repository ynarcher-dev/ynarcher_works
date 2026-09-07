import type { EntityRow } from '@/features/master/entityHooks'
import { readGrowth, readBusinessStatus } from '@/features/startup/startupGrowth'
import { readBusiness, readIp, readTeam, readTech } from '@/features/startup/startupProfile'
import { readSummary } from '@/features/startup/StartupSummaryCards'
import { readShareholderHistory } from '@/features/startup/startupShareholders'

/**
 * 'AI 작성하기'의 체크 단위 — 상세 카드 12종.
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
  'basics',
  'summary',
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

/** AI가 같은 자료를 함께 탐색하는 묶음. 서버의 EXTRACTION_FAMILY와 같은 키를 쓴다. */
export type AiCardGroup = 'overview' | 'organization' | 'growth' | 'capital'

/** 내부 처리 이름을 분류명처럼 보이지 않게, 실제로 들어 있는 카드 이름으로 설명한다. */
export const AI_CARD_GROUPS: ReadonlyArray<{ key: AiCardGroup; label: string }> = [
  { key: 'overview', label: '개요' },
  { key: 'organization', label: '팀·지식재산' },
  { key: 'growth', label: '성장' },
  { key: 'capital', label: '재무·인력·자본' },
]

export interface AiCardMeta {
  key: AiCardKey
  label: string
  group: AiCardGroup
  /** 현재 이 카드에 값이 있는가. 줄 오른쪽의 Y/N 배지와 교체 경고가 이 값을 읽는다. */
  filled: (record: EntityRow) => boolean
  /** 목록형 카드의 현재 건수(없으면 null). '작성됨 · 3건'의 뒷자리. */
  count?: (record: EntityRow) => number
}

const some = (...values: unknown[]) => values.some((v) => (typeof v === 'string' ? v.trim() !== '' : Boolean(v)))

/**
 * 카드 정의. `filled`는 "AI가 덮어쓸 것이 있는가"를 답한다 — 하나라도 값이 있으면 채워진
 * 카드(`Y`)로 본다. 절반만 찬 카드를 빈 카드로 세지 않는 것이 요점이다. 그 절반은 담당자가
 * 손으로 적은 것이고, 이 카드를 켜면 그것까지 함께 바뀐다는 사실을 배지가 미리 말해야 한다.
 *
 * 2026-09-06 이전에는 이 값이 **기본 체크 상태**까지 정했다(빈 카드는 켜고 찬 카드는 끈다).
 * 지금은 모달이 아무것도 켜지 않은 채 열리므로 표시에만 쓴다.
 */
export const AI_CARDS: AiCardMeta[] = [
  {
    key: 'basics',
    label: '기본 정보',
    group: 'overview',
    // 서류에 인쇄된 값이라 판단이 끼지 않는 유일한 카드다. 수정 모드에서는 기업명이 늘 차
    // 있어 기본으로 꺼지고, 등록 모드의 빈 폼에서만 켜진다 — 첫 등록이 이 카드의 자리다.
    filled: (r) =>
      some(r.name, r.representative, r.company_form, r.founded_on, r.biz_reg_no, r.location, r.address_detail),
  },
  {
    key: 'summary',
    label: '요약',
    group: 'overview',
    // 유일하게 판단을 요구하는 카드. 세 축 중 하나라도 차 있으면 손댄 것으로 본다.
    filled: (r) => {
      const sm = readSummary(r)
      return some(sm.strengths.length, sm.improvements.length, sm.needs.length)
    },
    count: (r) => {
      const sm = readSummary(r)
      return sm.strengths.length + sm.improvements.length + sm.needs.length
    },
  },
  {
    key: 'business',
    label: '비즈니스',
    group: 'overview',
    filled: (r) => {
      const b = readBusiness(r)
      return some(b.oneLiner, b.businessModel, b.targetMarket, b.revenueModel, b.salesChannel, b.supplyMode)
    },
  },
  {
    key: 'tech',
    label: '제품·기술',
    group: 'overview',
    filled: (r) => {
      const t = readTech(r)
      return some(t.product, t.devStage, t.coreTech, t.devInsourcing, t.differentiator)
    },
  },
  {
    key: 'team',
    label: '팀·조직',
    group: 'organization',
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
    group: 'organization',
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
    group: 'growth',
    filled: (r) => readBusinessStatus(r).length > 0,
    count: (r) => readBusinessStatus(r).length,
  },
  {
    key: 'traction',
    label: '트랙션·고객',
    group: 'growth',
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
    group: 'capital',
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
    group: 'capital',
    filled: (r) => readGrowth(r).employee.length > 0,
    count: (r) => readGrowth(r).employee.length,
  },
  {
    key: 'shareholders',
    label: '주주',
    group: 'capital',
    filled: (r) => readShareholderHistory(r).length > 0,
    count: (r) => readShareholderHistory(r).length,
  },
  {
    key: 'investment',
    label: '투자',
    group: 'capital',
    filled: (r) => readGrowth(r).investment.length > 0,
    count: (r) => readGrowth(r).investment.length,
  },
]

/** 카드 키 → 라벨(요약 줄·경고에서 카드를 부르는 말). */
export const AI_CARD_LABEL: Record<AiCardKey, string> = AI_CARDS.reduce(
  (acc, c) => ({ ...acc, [c.key]: c.label }),
  {} as Record<AiCardKey, string>,
)
