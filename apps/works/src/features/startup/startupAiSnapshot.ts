import type { EntityRow } from '@/features/master/entityHooks'
import type { StartupDetailFormValues } from '@/features/startup/startupFormValues'
import { readBusiness, readIp, readTeam, readTech, type IpProfile } from '@/features/startup/startupProfile'
import {
  readBusinessStatus,
  readGrowth,
  type BusinessStatusEntry,
  type GrowthMetrics,
} from '@/features/startup/startupGrowth'
import { readShareholderHistory, type ShareholderSnapshot } from '@/features/startup/startupShareholders'
import type { StartupSummary } from '@/features/startup/StartupSummaryCards'

/**
 * 편집 폼의 살아 있는 값 ↔ 카드 컬럼 사이의 왕복.
 *
 * AI 초안을 **원장 행이 아니라 지금 폼에 적힌 값 위에** 얹기 위해 있다. 조회 화면에서 열던
 * 시절에는 원장 행을 기준으로 합치면 됐지만, 편집 중에 누르는 버튼이 되면 그 기준은 틀린다 —
 * 담당자가 방금 손으로 적어 아직 저장하지 않은 값이 있고, "AI가 못 찾은 칸은 기존 값을
 * 유지한다"의 **기존 값**은 원장이 아니라 화면에 보이는 그것이어야 한다.
 *
 * 그래서 폼 값을 원장 행 모양으로 한 번 세우고(`buildCardSnapshot`), 검증된 병합 규칙
 * (`applyAiDraft`)을 그대로 통과시킨 뒤, 결과를 다시 폼으로 되돌린다. 병합 규칙을 폼용으로
 * 다시 쓰지 않는 이유는 그 규칙이 이 기능에서 유일하게 되돌릴 수 없는 사고가 나는 자리이기
 * 때문이다 — 두 벌이 되면 한쪽만 고치는 날이 온다.
 *
 * **일곱 카드 컬럼만 오간다.** 이름·연락처·사진·분야·미디어는 AI가 건드리지 않으므로 이
 * 왕복에 태우지 않는다(태우면 왕복에서 빠뜨린 칸이 조용히 비워진다).
 *
 * 근거: docs/docs_planning/3_3_5_startup_ai_fill.md §4.5·§5.1
 */

/** 폼이 상태로 들고 있는 카드 값(폼 값이 아닌 것들). */
export interface AiCardState {
  capabilities: string[]
  ip: IpProfile
  growth: GrowthMetrics
  businessStatus: BusinessStatusEntry[]
  shareholders: ShareholderSnapshot[]
  summary: StartupSummary
}

/**
 * 지금 폼에 적힌 값을 원장 행 모양으로 세운다.
 *
 * 요약 3축(강점·보완점·필요사항)을 함께 담는 이유는 AI가 그것을 쓰기 때문이 아니라 **쓰지
 * 않기 때문**이다 — 같은 컬럼(`business_profile`)에 사는 값이라, 보존 규칙이 실제로 지켜지는지가
 * 이 스냅샷에 그 키가 있어야만 드러난다.
 */
export function buildCardSnapshot(v: StartupDetailFormValues, s: AiCardState): EntityRow {
  return {
    id: 'form-snapshot',
    name: v.name,
    business_profile: {
      oneLiner: v.oneLiner,
      businessModel: v.businessModel,
      targetMarket: v.targetMarket,
      revenueModel: v.revenueModel,
      salesChannel: v.salesChannel,
      supplyMode: v.supplyMode,
      strengths: s.summary.strengths,
      improvements: s.summary.improvements,
      needs: s.summary.needs,
    },
    tech_profile: {
      product: v.product,
      devStage: v.devStage,
      coreTech: v.coreTech,
      devInsourcing: v.devInsourcing,
      differentiator: v.differentiator,
    },
    team_profile: {
      founderStrength: v.founderStrength,
      orgComposition: v.orgComposition,
      hiringPlan: v.hiringPlan,
      members: v.members,
      advisors: v.advisors,
      capabilities: s.capabilities,
    },
    ip_profile: s.ip,
    business_status: s.businessStatus,
    growth_metrics: s.growth,
    shareholders: s.shareholders,
  }
}

/**
 * 병합 결과를 폼 값으로 되돌린다. 카드 밖 값(`v`)은 그대로 흘려보낸다.
 *
 * 팀원·자문단의 각 칸을 빈 문자열로 채우는 것은 폼의 초기값 규약과 같다 — 값이 없으면
 * 컨트롤이 비제어로 떨어져 입력이 먹지 않는다. 지분 보유는 화면 칸이 boolean이라 여기서
 * null이 false로 눕는다(그 사실은 서버가 `notes`에 남긴다).
 */
export function toFormValues(merged: EntityRow, v: StartupDetailFormValues): StartupDetailFormValues {
  const b = readBusiness(merged)
  const tech = readTech(merged)
  const t = readTeam(merged)
  return {
    ...v,
    oneLiner: b.oneLiner ?? '',
    businessModel: b.businessModel ?? '',
    targetMarket: b.targetMarket ?? '',
    revenueModel: b.revenueModel ?? '',
    salesChannel: b.salesChannel ?? '',
    supplyMode: b.supplyMode ?? '',
    product: tech.product ?? '',
    devStage: tech.devStage ?? '',
    coreTech: tech.coreTech ?? '',
    devInsourcing: tech.devInsourcing ?? '',
    differentiator: tech.differentiator ?? '',
    founderStrength: t.founderStrength ?? '',
    orgComposition: t.orgComposition ?? '',
    hiringPlan: t.hiringPlan ?? '',
    members: (t.members ?? []).map((m) => ({
      name: m.name ?? '',
      role: m.role ?? '',
      background: m.background ?? '',
      employment: m.employment ?? '',
      joinedAt: m.joinedAt ?? '',
      hasEquity: Boolean(m.hasEquity),
    })),
    advisors: (t.advisors ?? []).map((a) => ({
      name: a.name ?? '',
      affiliation: a.affiliation ?? '',
      role: a.role ?? '',
    })),
  }
}

/** 병합 결과에서 폼이 상태로 드는 카드 값을 다시 읽는다. 요약 3축은 AI가 쓰지 않으므로 그대로 둔다. */
export function toCardState(merged: EntityRow, s: AiCardState): AiCardState {
  return {
    ...s,
    capabilities: readTeam(merged).capabilities ?? [],
    ip: readIp(merged),
    growth: readGrowth(merged),
    businessStatus: readBusinessStatus(merged),
    shareholders: readShareholderHistory(merged),
  }
}
