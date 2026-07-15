import type { EntityRow } from '@/features/networks/hooks'
import type { CategoryDatum } from '@/features/networks/dashboard/CategoryBarList'
import { readGrowth, readIndustries } from '@/features/startup/startupGrowth'
import {
  MANAGEMENT_STATUS_LABEL,
  type ManagementStatus,
} from '@/features/startup/startupClassification'

/**
 * 스타트업 대시보드 파생 집계(순수 함수 모음). 원장 rows(활성 스타트업)를 단일 조회한 뒤
 * 산업/소재지/단계/현황/업력 분포·랭킹·투자추이·퍼널·KPI·담당자 부하를 모두 클라이언트에서 계산한다.
 * 서버 라운드트립을 늘리지 않기 위해 배포 시점 rows 한 벌로 모든 카드를 채운다.
 */

/** 만 업력(년). 설립일이 없거나 미래면 null. formatFounded와 동일한 만(滿) 연수 규칙. */
export function foundedYears(v: unknown): number | null {
  const s = v ? String(v).slice(0, 10) : ''
  if (s.length < 10) return null
  const d = new Date(`${s}T00:00:00`)
  if (Number.isNaN(d.getTime())) return null
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  if (now.getTime() < d.getTime()) return null
  let years = now.getFullYear() - d.getFullYear()
  const anniv = new Date(d)
  anniv.setFullYear(d.getFullYear() + years)
  if (anniv.getTime() > now.getTime()) years -= 1
  return years < 0 ? null : years
}

/** 스칼라 컬럼(단계·소재지·현황 등) 값별 건수. 빈값은 '미지정'으로 마지막에 합산. 건수 내림차순. */
export function countByColumn(rows: EntityRow[], key: string): CategoryDatum[] {
  const counts = new Map<string, number>()
  let none = 0
  for (const r of rows) {
    const v = r[key]
    const s = v == null ? '' : String(v).trim()
    if (!s) none += 1
    else counts.set(s, (counts.get(s) ?? 0) + 1)
  }
  const result = [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
  if (none > 0) result.push({ label: '미지정', count: none })
  return result
}

/** 산업(industries 다중 태그) 태그별 보유 기업 수(중복 집계). 미기재는 '미지정'. 건수 내림차순. */
export function countIndustries(rows: EntityRow[]): CategoryDatum[] {
  const counts = new Map<string, number>()
  let none = 0
  for (const r of rows) {
    const list = readIndustries(r)
    if (list.length === 0) {
      none += 1
      continue
    }
    for (const tag of list) counts.set(tag, (counts.get(tag) ?? 0) + 1)
  }
  const result = [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
  if (none > 0) result.push({ label: '미지정', count: none })
  return result
}

/** 업력 구간(표시 순서 고정, 건수순 아님). 설립일 미상은 '미상'으로 마지막에 둔다. */
const AGE_BUCKETS: { label: string; max: number }[] = [
  { label: '1년 미만', max: 1 },
  { label: '1~3년', max: 3 },
  { label: '3~5년', max: 5 },
  { label: '5~7년', max: 7 },
  { label: '7~10년', max: 10 },
  { label: '10년 이상', max: Infinity },
]

/** 업력 분포(구간별 기업 수). 히스토그램이므로 건수순 정렬하지 않고 구간 순서를 유지한다. */
export function countAgeBuckets(rows: EntityRow[]): CategoryDatum[] {
  const counts = AGE_BUCKETS.map((b) => ({ label: b.label, count: 0 }))
  let unknown = 0
  for (const r of rows) {
    const y = foundedYears(r.founded_on)
    if (y == null) {
      unknown += 1
      continue
    }
    const idx = AGE_BUCKETS.findIndex((b) => y < b.max)
    const bucket = counts[idx === -1 ? AGE_BUCKETS.length - 1 : idx]
    if (bucket) bucket.count += 1
  }
  if (unknown > 0) counts.push({ label: '미상', count: unknown })
  return counts
}

/** 담당자별 관리 기업 수(투자기업 지정 담당자). 미지정 담당자는 제외. 건수 내림차순. */
export function countManagerLoad(rows: EntityRow[]): CategoryDatum[] {
  const counts = new Map<string, number>()
  for (const r of rows) {
    const managers = Array.isArray(r.managers) ? r.managers : []
    for (const m of managers as { user?: { name?: string | null } | null }[]) {
      const name = m.user?.name?.trim()
      if (name) counts.set(name, (counts.get(name) ?? 0) + 1)
    }
  }
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
}

/** 발굴 → 보육 → 투자 퍼널 단계(기타 제외, 표시 순서 고정). */
const FUNNEL_STEPS: ManagementStatus[] = ['sourced', 'incubated', 'invested']

/** 투자 파이프라인 퍼널(구분별 기업 수). 발굴→보육→투자 순서 고정. */
export function computeFunnel(rows: EntityRow[]): CategoryDatum[] {
  return FUNNEL_STEPS.map((status) => ({
    label: MANAGEMENT_STATUS_LABEL[status],
    count: rows.filter((r) => r.management_status === status).length,
  }))
}

/** 랭킹 1행: 최신 밸류에이션(Pre)·누적 투자유치액·업력을 정렬 축으로 갖는다. */
export interface StartupRankRow {
  id: string
  name: string
  /** 구분(management_status 라벨). */
  category: string
  /** 단계(stage). */
  stage: string
  /** 최신 기업가치(Pre, 원). 없으면 null. */
  valuation: number | null
  /** 누적 투자유치액(원). 없으면 null. */
  funding: number | null
  /** 만 업력(년). 없으면 null. */
  ageYears: number | null
}

/** 랭킹 정렬 축. */
export type RankMetric = 'valuation' | 'funding' | 'age'

/** 랭킹 대상 행(전 구분). 최신 밸류·누적 유치액·업력을 성장 지표에서 뽑아 만든다. */
export function buildRankRows(rows: EntityRow[]): StartupRankRow[] {
  return rows.map((r) => {
    const g = readGrowth(r)
    // 투자는 기준월 내림차순으로 정렬돼 있으므로 밸류가 있는 첫 항목이 최신값.
    const latestVal = g.investment.find((e) => e.valuation != null)?.valuation ?? null
    const funding = g.investment.reduce<number | null>((sum, e) => {
      if (e.fundingAmount == null) return sum
      return (sum ?? 0) + Number(e.fundingAmount)
    }, null)
    return {
      id: r.id,
      name: r.name,
      category: MANAGEMENT_STATUS_LABEL[r.management_status as ManagementStatus] ?? '-',
      stage: r.stage ? String(r.stage) : '-',
      valuation: latestVal,
      funding,
      ageYears: foundedYears(r.founded_on),
    }
  })
}

/** 선택 축 내림차순 정렬(값 없는 항목은 뒤로). */
export function sortRankRows(rows: StartupRankRow[], metric: RankMetric): StartupRankRow[] {
  const val = (r: StartupRankRow) =>
    metric === 'valuation' ? r.valuation : metric === 'funding' ? r.funding : r.ageYears
  return [...rows].sort((a, b) => (val(b) ?? -1) - (val(a) ?? -1))
}

/** 월별 투자유치 합계(YYYY-MM 오름차순). StartupMetricChart(xKey='date')용. */
export function investmentTrend(rows: EntityRow[]): { date: string; fundingAmount: number }[] {
  const byMonth = new Map<string, number>()
  for (const r of rows) {
    for (const e of readGrowth(r).investment) {
      const date = (e.date ?? '').slice(0, 7)
      if (!date || e.fundingAmount == null) continue
      byMonth.set(date, (byMonth.get(date) ?? 0) + Number(e.fundingAmount))
    }
  }
  return [...byMonth.entries()]
    .map(([date, fundingAmount]) => ({ date, fundingAmount }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

/** 투자 라운드별 건수 분포(파이용). 라운드 미기재는 '미지정'. 건수 내림차순. */
export function roundDistribution(rows: EntityRow[]): CategoryDatum[] {
  const counts = new Map<string, number>()
  let none = 0
  for (const r of rows) {
    for (const e of readGrowth(r).investment) {
      const round = e.round?.trim()
      if (!round) none += 1
      else counts.set(round, (counts.get(round) ?? 0) + 1)
    }
  }
  const result = [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
  if (none > 0) result.push({ label: '미지정', count: none })
  return result
}

/** 포트폴리오 요약 KPI. */
export interface StartupKpis {
  totalCompanies: number
  investedCount: number
  /** 투자기업 최신 밸류(Pre) 합계(원). */
  portfolioValuation: number
  /** 전 구분 누적 투자유치액 합계(원). */
  cumulativeFunding: number
  /** 평균 만 업력(년, 설립일 있는 기업 기준). 없으면 null. */
  avgAgeYears: number | null
}

/** 대시보드 상단 KPI 타일 값. 밸류/유치액은 성장 지표에서 집계한다. */
export function computeKpis(rows: EntityRow[]): StartupKpis {
  let portfolioValuation = 0
  let cumulativeFunding = 0
  let ageSum = 0
  let ageCount = 0
  let investedCount = 0
  for (const r of rows) {
    const g = readGrowth(r)
    cumulativeFunding += g.investment.reduce((s, e) => s + (Number(e.fundingAmount) || 0), 0)
    if (r.management_status === 'invested') {
      investedCount += 1
      portfolioValuation += Number(g.investment.find((e) => e.valuation != null)?.valuation) || 0
    }
    const y = foundedYears(r.founded_on)
    if (y != null) {
      ageSum += y
      ageCount += 1
    }
  }
  return {
    totalCompanies: rows.length,
    investedCount,
    portfolioValuation,
    cumulativeFunding,
    avgAgeYears: ageCount > 0 ? Math.round((ageSum / ageCount) * 10) / 10 : null,
  }
}
