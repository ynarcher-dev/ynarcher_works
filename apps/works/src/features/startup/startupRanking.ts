import type { EntityRow } from '@/features/networks/hooks'
import { readIndustries, readMetrics, type GrowthMetric } from '@/features/startup/startupGrowth'

/** 순위 모집단(peer group) 기준. */
export type RankMode = 'industry' | 'year'

/** 순위 대상 지표(재무/매출/고용/투자 9종). */
export interface RankMetricDef {
  key: string
  label: string
  group: string
  /** 금액(천원 표기) 여부. false면 인원(명). */
  money: boolean
  pick: (m: GrowthMetric) => number | null | undefined
}

/** 비교 카드와 동일한 그룹·순서로 9개 지표를 정의한다. */
export const RANK_METRICS: RankMetricDef[] = [
  { key: 'assets', label: '자산', group: '재무 현황', money: true, pick: (m) => m.assets },
  { key: 'liabilities', label: '부채', group: '재무 현황', money: true, pick: (m) => m.liabilities },
  { key: 'equity', label: '자본', group: '재무 현황', money: true, pick: (m) => m.equity },
  { key: 'revenue', label: '매출액', group: '매출 현황', money: true, pick: (m) => m.revenue },
  { key: 'operatingProfit', label: '영업이익', group: '매출 현황', money: true, pick: (m) => m.operatingProfit },
  { key: 'netIncome', label: '당기순이익', group: '매출 현황', money: true, pick: (m) => m.netIncome },
  { key: 'employeeCount', label: '고용 인원', group: '고용 현황', money: false, pick: (m) => m.employeeCount },
  { key: 'valuation', label: '기업가치(Pre)', group: '투자 현황', money: true, pick: (m) => m.valuation },
  { key: 'fundingAmount', label: '투자유치액', group: '투자 현황', money: true, pick: (m) => m.fundingAmount },
]

/** 설립년차 구간(0~3 / 4~7 / 8~10 / 11~15 / 16+). */
export interface YearBucket {
  label: string
  min: number
  max: number
}
export const YEAR_BUCKETS: YearBucket[] = [
  { label: '0~3년차', min: 0, max: 3 },
  { label: '4~7년차', min: 4, max: 7 },
  { label: '8~10년차', min: 8, max: 10 },
  { label: '11~15년차', min: 11, max: 15 },
  { label: '16년차 이상', min: 16, max: Infinity },
]

/** 설립일 → 오늘 기준 만(滿) 경과 연수. 값 없거나 미래면 null. */
export function foundedYears(v: unknown): number | null {
  const s = v ? String(v).slice(0, 10) : ''
  if (s.length < 10) return null
  const founded = new Date(`${s}T00:00:00`)
  if (Number.isNaN(founded.getTime())) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  if (today.getTime() < founded.getTime()) return 0
  let years = today.getFullYear() - founded.getFullYear()
  const anniversary = new Date(founded)
  anniversary.setFullYear(founded.getFullYear() + years)
  if (anniversary.getTime() > today.getTime()) years -= 1
  return years
}

/** 설립일이 속한 년차 구간. 설립일 없으면 null. */
export function yearBucket(v: unknown): YearBucket | null {
  const y = foundedYears(v)
  if (y == null) return null
  return YEAR_BUCKETS.find((b) => y >= b.min && y <= b.max) ?? null
}

/** 지표별 '가장 최근 값'(최신 연도부터 내려오며 최초의 유효값). 없으면 null. */
function latestValue(record: EntityRow, pick: RankMetricDef['pick']): number | null {
  for (const m of readMetrics(record)) {
    const raw = pick(m)
    if (raw != null && !Number.isNaN(Number(raw))) return Number(raw)
  }
  return null
}

/**
 * 대상 기업이 모집단에서 어떤 순위인지 계산한다.
 * 모집단은 대상을 포함하며, 해당 지표에 값이 있는 기업만 분모(total)로 센다.
 * 내림차순(값이 클수록 1위). 값 없으면 value=null·rank=null.
 */
export interface RankResult {
  value: number | null
  rank: number | null
  total: number
  /** 상위 백분위(rank/total, 정수 %). total<2면 null. */
  percentile: number | null
}
export function rankInGroup(target: EntityRow, group: EntityRow[], def: RankMetricDef): RankResult {
  const values = group
    .map((r) => latestValue(r, def.pick))
    .filter((v): v is number => v != null)
  const value = latestValue(target, def.pick)
  const total = values.length
  if (value == null) return { value: null, rank: null, total, percentile: null }
  const rank = values.filter((v) => v > value).length + 1
  const percentile = total >= 2 ? Math.max(1, Math.round((rank / total) * 100)) : null
  return { value, rank, total, percentile }
}

/**
 * 모드별 모집단을 구한다. 대상 자신도 포함한다.
 * - industry: 대상과 산업 태그를 하나라도 공유하는 기업.
 * - year: 대상과 같은 년차 구간에 속하는 기업.
 * 대상이 기준(태그/설립일)을 갖지 못하면 null(계산 불가).
 */
export function peerGroup(target: EntityRow, pool: EntityRow[], mode: RankMode): EntityRow[] | null {
  if (mode === 'industry') {
    const tags = new Set(readIndustries(target))
    if (tags.size === 0) return null
    return pool.filter((r) => readIndustries(r).some((i) => tags.has(i)))
  }
  const bucket = yearBucket(target.founded_on)
  if (!bucket) return null
  return pool.filter((r) => yearBucket(r.founded_on)?.label === bucket.label)
}
