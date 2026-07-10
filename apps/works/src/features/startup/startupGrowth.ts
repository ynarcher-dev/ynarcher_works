import type { EntityRow } from '@/features/networks/hooks'

/** 연도별 성장 지표 1개(startups.growth_metrics 배열 원소). */
export interface GrowthMetric {
  year: number
  // 재무
  assets?: number | null
  liabilities?: number | null
  equity?: number | null
  // 매출/손익
  revenue?: number | null
  operatingProfit?: number | null
  netIncome?: number | null
  // 고용
  employeeCount?: number | null
  // 투자
  valuation?: number | null
  fundingAmount?: number | null
  fundingRound?: string
  investor?: string
}

/** 비즈니스 현황 타임라인 1건(startups.business_status 배열 원소). */
export interface BusinessStatusEntry {
  date: string
  content: string
}

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : []
}

/** 성장 지표를 연도 내림차순으로 읽는다. */
export function readMetrics(record: EntityRow): GrowthMetric[] {
  return asArray(record.growth_metrics)
    .map((m) => m as GrowthMetric)
    .sort((a, b) => (Number(b.year) || 0) - (Number(a.year) || 0))
}

/** 비즈니스 현황을 날짜 내림차순으로 읽는다. */
export function readBusinessStatus(record: EntityRow): BusinessStatusEntry[] {
  return asArray(record.business_status)
    .map((e) => e as BusinessStatusEntry)
    .sort((a, b) => String(b.date ?? '').localeCompare(String(a.date ?? '')))
}

/** 원화 표기(12,345원). 값 없으면 '-'. */
export function formatKRW(v: number | null | undefined): string {
  if (v == null || Number.isNaN(Number(v))) return '-'
  return `${Number(v).toLocaleString()}원`
}
