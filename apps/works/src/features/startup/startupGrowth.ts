import type { EntityRow } from '@/features/networks/hooks'

/** 재무 지표 1건(연도 기준). */
export interface FinanceEntry {
  year: number
  assets?: number | null
  liabilities?: number | null
  equity?: number | null
}

/** 매출/손익 지표 1건(연도 기준). */
export interface RevenueEntry {
  year: number
  revenue?: number | null
  operatingProfit?: number | null
  netIncome?: number | null
}

/** 고용 지표 1건(연도 기준). */
export interface EmployeeEntry {
  year: number
  employeeCount?: number | null
}

/** 투자 유치 1건(월 기준 — 회계연도와 무관하게 발생 시점으로 관리). */
export interface InvestmentEntry {
  /** 기준월 YYYY-MM. */
  date: string
  round?: string
  valuation?: number | null
  fundingAmount?: number | null
  investor?: string
}

/**
 * 항목별 성장 지표(startups.growth_metrics).
 * 재무·매출·고용은 연도 기준, 투자는 월 기준으로 각각 독립 목록이다.
 * (구버전은 연도별 통합 배열 — readGrowth가 자동으로 항목별로 분해해 흡수한다.)
 */
export interface GrowthMetrics {
  finance: FinanceEntry[]
  revenue: RevenueEntry[]
  employee: EmployeeEntry[]
  investment: InvestmentEntry[]
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

/** 레거시(연도별 통합 배열) 원소 — 항목별 목록으로 분해할 때만 사용. */
interface LegacyGrowthMetric {
  year: number
  assets?: number | null
  liabilities?: number | null
  equity?: number | null
  revenue?: number | null
  operatingProfit?: number | null
  netIncome?: number | null
  employeeCount?: number | null
  valuation?: number | null
  fundingAmount?: number | null
  fundingRound?: string
  investor?: string
}

const byYearDesc = (a: { year?: number }, b: { year?: number }) => (Number(b.year) || 0) - (Number(a.year) || 0)
const byDateDesc = (a: { date?: string }, b: { date?: string }) =>
  String(b.date ?? '').localeCompare(String(a.date ?? ''))
/** 하나라도 값이 있으면 true(빈 항목은 마이그레이션에서 제외). */
const hasValue = (...vals: unknown[]) => vals.some((v) => v != null && v !== '')

/** 레거시 연도별 통합 배열을 항목별 목록으로 분해한다(투자는 연도→해당 연도 1월로 이관). */
function migrateLegacy(list: LegacyGrowthMetric[]): GrowthMetrics {
  const finance: FinanceEntry[] = []
  const revenue: RevenueEntry[] = []
  const employee: EmployeeEntry[] = []
  const investment: InvestmentEntry[] = []
  for (const m of list) {
    const year = Number(m.year) || 0
    if (hasValue(m.assets, m.liabilities, m.equity))
      finance.push({ year, assets: m.assets, liabilities: m.liabilities, equity: m.equity })
    if (hasValue(m.revenue, m.operatingProfit, m.netIncome))
      revenue.push({ year, revenue: m.revenue, operatingProfit: m.operatingProfit, netIncome: m.netIncome })
    if (hasValue(m.employeeCount)) employee.push({ year, employeeCount: m.employeeCount })
    if (hasValue(m.valuation, m.fundingAmount, m.fundingRound, m.investor))
      investment.push({
        date: year ? `${year}-01` : '',
        round: m.fundingRound,
        valuation: m.valuation,
        fundingAmount: m.fundingAmount,
        investor: m.investor,
      })
  }
  return {
    finance: finance.sort(byYearDesc),
    revenue: revenue.sort(byYearDesc),
    employee: employee.sort(byYearDesc),
    investment: investment.sort(byDateDesc),
  }
}

/**
 * 항목별 성장 지표를 읽는다. 신형(항목별 객체)과 레거시(연도별 통합 배열)를 모두 흡수한다.
 * 재무·매출·고용은 연도 내림차순, 투자는 기준월 내림차순.
 */
export function readGrowth(record: EntityRow): GrowthMetrics {
  const raw = record.growth_metrics
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const o = raw as Record<string, unknown>
    return {
      finance: asArray(o.finance).map((e) => e as FinanceEntry).sort(byYearDesc),
      revenue: asArray(o.revenue).map((e) => e as RevenueEntry).sort(byYearDesc),
      employee: asArray(o.employee).map((e) => e as EmployeeEntry).sort(byYearDesc),
      investment: asArray(o.investment).map((e) => e as InvestmentEntry).sort(byDateDesc),
    }
  }
  return migrateLegacy(asArray(raw).map((m) => m as LegacyGrowthMetric))
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
