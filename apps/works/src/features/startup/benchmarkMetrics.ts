import { readBusiness } from '@/features/startup/StartupBusinessTeamCard'
import { managementStatusLabel } from '@/features/startup/startupClassification'
import {
  formatFounded,
  readGrowth,
  type EmployeeEntry,
  type FinanceEntry,
  type InvestmentEntry,
  type RevenueEntry,
} from '@/features/startup/startupGrowth'
import type { EntityRow } from '@/features/networks/hooks'

/**
 * 벤치마크 한 열(기업 하나)이 비교에 쓰는 지표 묶음.
 *
 * 상세페이지의 좌우 비교 카드 시절에는 두 기업이 **각자의 최신 연도**를 썼다 — 2025년 실적과
 * 2022년 실적을 나란히 놓고 비교라고 부르는 상태였다. 기업 수가 늘면 그 어긋남도 같이 늘어나므로,
 * 기준연도를 밖에서 하나로 정할 수 있게 스냅샷을 만드는 단계를 따로 둔다.
 */
export interface CompanySnapshot {
  record: EntityRow
  /** 이 열이 실제로 읽은 연도(재무→매출→고용 순으로 존재하는 것). 없으면 undefined. */
  year?: number
  finance?: FinanceEntry
  revenue?: RevenueEntry
  employee?: EmployeeEntry
  investment?: InvestmentEntry
}

/** 연도 목록에서 기준연도에 해당하는 1건을 고른다. 기준연도가 null이면 최신 1건. */
function pickByYear<T extends { year: number }>(list: T[], baseYear: number | null): T | undefined {
  if (baseYear == null) return list[0]
  return list.find((e) => Number(e.year) === baseYear)
}

/**
 * 기업 1곳의 비교 스냅샷. `baseYear`가 지정되면 그 연도의 실적만 읽고(없으면 빈 값),
 * null이면 항목별 최신 1건을 읽는다. 투자는 회계연도와 무관한 이벤트라 언제나 최신 1건이다.
 */
export function snapshotOf(record: EntityRow, baseYear: number | null): CompanySnapshot {
  const g = readGrowth(record)
  const finance = pickByYear(g.finance, baseYear)
  const revenue = pickByYear(g.revenue, baseYear)
  const employee = pickByYear(g.employee, baseYear)
  return {
    record,
    year: baseYear ?? finance?.year ?? revenue?.year ?? employee?.year,
    finance,
    revenue,
    employee,
    investment: g.investment[0],
  }
}

/** 선택된 기업들이 실적을 가진 연도의 합집합(내림차순). 기준연도 선택지의 원천. */
export function availableYears(records: EntityRow[]): number[] {
  const years = new Set<number>()
  for (const r of records) {
    const g = readGrowth(r)
    for (const e of [...g.finance, ...g.revenue, ...g.employee]) {
      const y = Number(e.year)
      if (Number.isFinite(y) && y > 0) years.add(y)
    }
  }
  return [...years].sort((a, b) => b - a)
}

/** 나눗셈 파생 지표 — 분모가 없거나 0이면 값 없음으로 둔다(0으로 나눈 무한대를 지표로 쓰지 않는다). */
function ratio(numerator: unknown, denominator: unknown): number | null {
  const n = Number(numerator)
  const d = Number(denominator)
  if (!Number.isFinite(n) || !Number.isFinite(d) || d === 0) return null
  return (n / d) * 100
}

/** 셀에 담기는 값의 종류. 단위 표기와 정렬(숫자는 tabular-nums)을 이것이 정한다. */
export type CellKind = 'won' | 'count' | 'ratio' | 'text'

export interface MetricRow {
  label: string
  kind: CellKind
  /**
   * 마스킹 대상 개인정보 필드. 목록과 같은 정책(ADMIN '민감정보 관리')을 이 화면에도 건다 —
   * 기업 다섯의 대표자명이 한 줄에 늘어서는 자리라 목록과 다를 이유가 없다.
   */
  sensitive?: 'name'
  /** 값이 없으면 null/undefined/빈 문자열을 돌려준다 — 표기는 화면이 정한다. */
  read: (s: CompanySnapshot) => number | string | null | undefined
}

export interface MetricGroup {
  title: string
  /** 그룹 우상단 단위 안내(금액 그룹만). */
  unitNote?: string
  rows: MetricRow[]
}

/**
 * 비교 항목 정의(단일 원천). 화면은 이 목록을 그대로 행으로 펼치므로, 항목을 늘리는 일은
 * 여기 한 줄을 더하는 일이 된다 — 열(기업)이 늘어도 표 컴포넌트는 손대지 않는다.
 *
 * 파생 비율(부채비율·영업이익률·1인당 매출)을 함께 두는 이유는 벤치마크의 목적 때문이다.
 * 규모가 다른 동종기업을 원값(자산·매출)만으로 나란히 놓으면 큰 쪽이 언제나 좋아 보인다.
 */
export const METRIC_GROUPS: MetricGroup[] = [
  {
    title: '기업 정보',
    rows: [
      { label: '구분', kind: 'text', read: (s) => managementStatusLabel(s.record.management_status) },
      { label: '소개', kind: 'text', read: (s) => readBusiness(s.record).oneLiner },
      {
        label: '대표자',
        kind: 'text',
        sensitive: 'name',
        read: (s) => s.record.representative as string,
      },
      {
        label: '설립일',
        kind: 'text',
        read: (s) => (s.record.founded_on ? formatFounded(s.record.founded_on) : null),
      },
      { label: '소재지', kind: 'text', read: (s) => s.record.location as string },
      { label: '성장 단계', kind: 'text', read: (s) => s.record.stage as string },
    ],
  },
  {
    title: '재무 현황',
    unitNote: '단위: 천원',
    rows: [
      { label: '자산', kind: 'won', read: (s) => s.finance?.assets },
      { label: '부채', kind: 'won', read: (s) => s.finance?.liabilities },
      { label: '자본', kind: 'won', read: (s) => s.finance?.equity },
      { label: '부채비율', kind: 'ratio', read: (s) => ratio(s.finance?.liabilities, s.finance?.equity) },
    ],
  },
  {
    title: '매출 현황',
    unitNote: '단위: 천원',
    rows: [
      { label: '매출액', kind: 'won', read: (s) => s.revenue?.revenue },
      { label: '영업이익', kind: 'won', read: (s) => s.revenue?.operatingProfit },
      { label: '당기순이익', kind: 'won', read: (s) => s.revenue?.netIncome },
      {
        label: '영업이익률',
        kind: 'ratio',
        read: (s) => ratio(s.revenue?.operatingProfit, s.revenue?.revenue),
      },
      { label: '순이익률', kind: 'ratio', read: (s) => ratio(s.revenue?.netIncome, s.revenue?.revenue) },
    ],
  },
  {
    title: '고용 현황',
    unitNote: '단위: 천원',
    rows: [
      { label: '고용 인원', kind: 'count', read: (s) => s.employee?.employeeCount },
      {
        label: '1인당 매출',
        kind: 'won',
        read: (s) => {
          const rev = Number(s.revenue?.revenue)
          const head = Number(s.employee?.employeeCount)
          if (!Number.isFinite(rev) || !Number.isFinite(head) || head === 0) return null
          return rev / head
        },
      },
    ],
  },
  {
    title: '투자 현황',
    unitNote: '단위: 천원',
    rows: [
      { label: '기준월', kind: 'text', read: (s) => s.investment?.date },
      { label: '라운드', kind: 'text', read: (s) => s.investment?.round },
      { label: '기업가치(Pre)', kind: 'won', read: (s) => s.investment?.valuation },
      { label: '투자유치액', kind: 'won', read: (s) => s.investment?.fundingAmount },
    ],
  },
]

export interface CellText {
  text: string
  /** 음수 여부 — 국내 관례대로 파란색으로 표기한다. */
  negative: boolean
  /** 값 없음 여부 — 실제 값과 구분되도록 한 단 흐리게 둔다. */
  empty: boolean
}

/**
 * 셀 표기. 금액은 천원 단위(÷1000 반올림), 비율은 소수 첫째 자리, 인원은 '명'을 붙인다.
 * 값이 없으면 `empty` 문구(비교 대상 미선택 열은 '-')로 물러난다.
 */
export function formatCell(kind: CellKind, v: unknown, empty: string): CellText {
  if (v == null || v === '') return { text: empty, negative: false, empty: true }
  if (kind === 'text') return { text: String(v), negative: false, empty: false }

  const n = Number(v)
  if (!Number.isFinite(n)) return { text: empty, negative: false, empty: true }
  if (kind === 'count') return { text: `${n.toLocaleString()}명`, negative: false, empty: false }
  if (kind === 'ratio') {
    const text = `${n < 0 ? '-' : ''}${Math.abs(n).toFixed(1)}%`
    return { text, negative: n < 0, empty: false }
  }
  const k = Math.round(n / 1000)
  return { text: `${k < 0 ? '-' : ''}${Math.abs(k).toLocaleString()}`, negative: k < 0, empty: false }
}
