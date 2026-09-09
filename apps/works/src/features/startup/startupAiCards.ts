import type { EntityRow } from '@/features/master/entityHooks'
import { readGrowth, readBusinessStatus } from '@/features/startup/startupGrowth'
import { readBusiness, readIp, readTeam, readTech } from '@/features/startup/startupProfile'
import { readSummary } from '@/features/startup/StartupSummaryCards'
import { readShareholderHistory } from '@/features/startup/startupShareholders'
import type { AiFillCatalog } from '@/features/ai/aiCatalog'

/**
 * 'AI 작성하기'의 체크 단위 — 상세 카드 15종.
 *
 * 체크 단위를 카드로 잡은 이유는 저장 단위와 같기 때문이다. 저장이 **카드 하나에 컬럼 하나**
 * (통째 교체)라, 체크되지 않은 카드는 그 컬럼을 건드리지 않으면 그만이다. 필드 단위로 잘게
 * 쪼개면 담당자가 열 몇 칸을 매번 훑어야 하고, 밴드 단위로 뭉치면 손으로 다듬어 둔 카드 하나
 * 때문에 밴드 전체를 포기하게 된다.
 *
 * **복합 카드 셋을 쪼갰다(2026-09-09 사용자 지정, 12종 → 15종).** 지식재산·인증은 목록 셋을,
 * 트랙션·고객과 매출·재무는 표 둘을 한 카드에 담고 있었다. 그 카드들은 **화면에서는 이미
 * 따로 서 있었으므로**(조회의 핵심 지표·주요 고객·매출 현황·재무 현황은 각각 별개 카드다)
 * 체크 한 칸이 화면의 두 자리를 함께 바꾸는 상태였고, 그래서 "매출만 다시 뽑고 재무는 손으로
 * 적어 둔 값을 지키자"가 불가능했다. **체크 단위는 담당자가 지키고 싶은 단위여야 한다.**
 *
 * 쪼개도 저장 규칙은 그대로다 — 한 컬럼을 여러 카드가 나눠 쓰는 자리가 늘 뿐이고(`ip_profile`이
 * 둘, `growth_metrics`가 여섯), 그 자리는 병합이 **키 단위 보존**으로 이미 다루고 있다
 * (startupAiMerge.ts).
 *
 * 근거: docs/docs_planning/3_3_7_ai_fill_visual_read.md §4
 */

/** 카드 키. Edge Function(supabase/functions/startup-ai-fill/cards.ts)의 목록과 한 벌이다. */
export const AI_CARD_KEYS = [
  'basics',
  'summary',
  'business',
  'tech',
  'team',
  'ip',
  'cert',
  'timeline',
  'traction',
  'customers',
  'revenue',
  'finance',
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

export interface StartupAiCardMeta {
  key: AiCardKey
  label: string
  group: AiCardGroup
  /** 현재 이 카드에 값이 있는가. 줄 오른쪽의 '있음' 배지와 교체 경고가 이 값을 읽는다. */
  filled: (record: EntityRow) => boolean
  /** 목록형 카드의 현재 건수(없으면 null). '있음' 배지의 커서 설명이 읽는다. */
  count?: (record: EntityRow) => number
}

const some = (...values: unknown[]) => values.some((v) => (typeof v === 'string' ? v.trim() !== '' : Boolean(v)))

/**
 * 카드 정의. `filled`는 "AI가 덮어쓸 것이 있는가"를 답한다 — 하나라도 값이 있으면 채워진
 * 카드로 본다. 절반만 찬 카드를 빈 카드로 세지 않는 것이 요점이다. 그 절반은 담당자가
 * 손으로 적은 것이고, 이 카드를 켜면 그것까지 함께 바뀐다는 사실을 배지가 미리 말해야 한다.
 *
 * 2026-09-06 이전에는 이 값이 **기본 체크 상태**까지 정했다(빈 카드는 켜고 찬 카드는 끈다).
 * 지금은 창이 아무것도 켜지 않은 채 열리므로 표시에만 쓴다.
 */
export const AI_CARDS: StartupAiCardMeta[] = [
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
    label: '지식재산',
    group: 'organization',
    filled: (r) => readIp(r).rights.length > 0,
    count: (r) => readIp(r).rights.length,
  },
  {
    key: 'cert',
    label: '인증·정부과제',
    group: 'organization',
    // 인증과 정부과제를 한 카드에 남긴 것은 둘 다 **밖에서 받은 자격**이고 한 문서(사업계획서
    // 부록)에서 함께 읽히기 때문이다. 지식재산과 갈린 이유는 그쪽이 우리가 만든 자산이라
    // 근거 문서(등록원부·공보)가 다르다.
    filled: (r) => {
      const ip = readIp(r)
      return ip.certifications.length + ip.govProjects.length > 0
    },
    count: (r) => {
      const ip = readIp(r)
      return ip.certifications.length + ip.govProjects.length
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
    label: '핵심 지표',
    group: 'growth',
    filled: (r) => readGrowth(r).traction.length > 0,
    count: (r) => readGrowth(r).traction.length,
  },
  {
    key: 'customers',
    label: '주요 고객',
    group: 'growth',
    filled: (r) => readGrowth(r).customers.length > 0,
    count: (r) => readGrowth(r).customers.length,
  },
  {
    key: 'revenue',
    label: '매출',
    group: 'capital',
    filled: (r) => readGrowth(r).revenue.length > 0,
    count: (r) => readGrowth(r).revenue.length,
  },
  {
    key: 'finance',
    label: '재무',
    group: 'capital',
    filled: (r) => readGrowth(r).finance.length > 0,
    count: (r) => readGrowth(r).finance.length,
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

/**
 * 공용 AI 작성 UI에 넘길 이 대상의 규격.
 *
 * **`filled`를 여기서 값으로 굳히는 것**이 요점이다(2026-09-07). 종전에는 창·격자가 원장 행을
 * 함께 받아 카드마다 `filled(record)`를 불렀고, 그 한 줄 때문에 두 컴포넌트가 스타트업 원장의
 * 모양을 알아야 했다. 무엇이 채워졌는지는 그 값을 가진 쪽만 답할 수 있는 물음이므로, 판정은
 * 여기서 끝내고 넘어가는 것은 결과값뿐이다.
 *
 * 기준이 저장된 행이 아니라 **지금 폼에 적힌 값**(`snapshot`)인 것은 그대로다 — 편집 중에
 * 누르는 버튼이라 아직 저장하지 않은 줄이 있고, 원장을 기준으로 판정하면 그 줄이 화면에서
 * 사라진 것처럼 보인다.
 */
export function startupAiCatalog(snapshot: EntityRow): AiFillCatalog<AiCardKey> {
  return {
    fillEndpoint: 'startup-ai-fill',
    extractEndpoint: 'startup-material-extract',
    groups: AI_CARD_GROUPS.map((g) => ({ key: g.key, label: g.label })),
    cards: AI_CARDS.map((c) => ({
      key: c.key,
      label: c.label,
      group: c.group,
      filled: c.filled(snapshot),
      count: c.count?.(snapshot),
    })),
  }
}
