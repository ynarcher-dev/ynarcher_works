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

/**
 * 산업 태그 배열(다중, 최대 3)을 읽는다. SSOT는 industries(jsonb 배열)이며,
 * 배열이 비어 있으면 레거시 단일 industry 텍스트를 1개짜리 목록으로 흡수한다.
 */
export function readIndustries(record: EntityRow): string[] {
  const list = asArray(record.industries)
    .map((v) => String(v).trim())
    .filter(Boolean)
  if (list.length > 0) return list
  const legacy = record.industry ? String(record.industry).trim() : ''
  return legacy ? [legacy] : []
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

/**
 * 설립일 + 오늘 기준 기업 나이(만 n년 n일). 값 없으면 '-'.
 * 설립 기념일을 실제 달력으로 더해 만(滿) 연수를 구하고 남은 일수를 계산하므로,
 * 달력 날짜 연산(setFullYear)과 실제 경과일 기준이라 윤년(2월 29일)이 자연히 반영된다.
 */
export function formatFounded(v: unknown): string {
  const date = v ? String(v).slice(0, 10) : ''
  if (date.length < 10) return '정보 없음'
  const founded = new Date(`${date}T00:00:00`)
  if (Number.isNaN(founded.getTime())) return date
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  if (today.getTime() < founded.getTime()) return date

  let years = today.getFullYear() - founded.getFullYear()
  const anniversary = new Date(founded)
  anniversary.setFullYear(founded.getFullYear() + years)
  if (anniversary.getTime() > today.getTime()) {
    years -= 1
    anniversary.setFullYear(founded.getFullYear() + years)
  }
  const days = Math.floor((today.getTime() - anniversary.getTime()) / 86_400_000)
  const age = years > 0 ? `${years}년 ${days.toLocaleString()}일` : `${days.toLocaleString()}일`
  return `${date} (${age})`
}
