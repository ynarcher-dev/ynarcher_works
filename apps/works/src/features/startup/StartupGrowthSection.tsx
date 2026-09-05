import { DataTable, EmptyValue, PanelCard, cardText, type Column } from '@ynarcher/ui'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { type EmployeeEntry, type FinanceEntry, type GrowthMetrics, type RevenueEntry } from '@/features/startup/startupGrowth'
import { useStartupFundInvestments } from '@/features/fund/hooks'
import { CHART_COLORS, StartupMetricChart, type ChartSeries } from '@/features/startup/StartupMetricChart'
import { StartupCustomerCard, StartupTractionCard } from '@/features/startup/StartupTractionCard'
import { StartupShareholderCard } from '@/features/startup/StartupShareholderCard'
import type { ShareholderSnapshot } from '@/features/startup/startupShareholders'

const C = CHART_COLORS

/**
 * 지표 카드 래퍼(제목 + 선택적 단위 표기 + 내용). 수정 버튼·수정 날짜는 두지 않는다(통합 수정으로 관리).
 *
 * 헤더는 공용 `PanelCard`가 소유하고, 단위는 헤더 우측 액션 자리에 놓는다. 한때 이 파일이
 * 공용 `Card`와 같은 이름의 로컬 카드를 따로 갖고 있어 카드 제목이 두 규격으로 갈라졌었다.
 */
function MetricCard({
  title,
  unit,
  children,
}: {
  title: string
  /** 헤더 우측 괄호 표기. 단위와 출처를 한 자리에 모은다 — 확정 숫자(재무제표)와 자기 보고
   *  (기업 제시)를 가르는 것은 카드의 자리가 아니라 이 한 줄이다. */
  unit?: string
  children: ReactNode
}) {
  return (
    <PanelCard
      title={title}
      action={unit && <span className={`shrink-0 ${cardText.subtitle}`}>({unit})</span>}
    >
      {children}
    </PanelCard>
  )
}

/** 금액 셀(백만원 단위, ÷1,000,000 반올림). 음수(적자·자본잠식)는 국내 관례대로 파란색 '-'로 표기. 단위는 카드 헤더에 표기. */
function Won({ v }: { v?: number | null }) {
  if (v == null || Number.isNaN(Number(v))) return <EmptyValue />
  const n = Math.round(Number(v) / 1_000_000)
  if (n < 0) return <span>-{Math.abs(n).toLocaleString()}</span>
  return <span>{n.toLocaleString()}</span>
}

/** 최신 N건만 노출(내림차순으로 이미 정렬됨). */
function recent<T>(list: T[], n = 5): T[] {
  return list.slice(0, n)
}

/** 재무·매출 카드의 막대차트 시리즈 정의. 고용·투자는 표만 둔다. */
const FINANCE_SERIES: ChartSeries[] = [
  { key: 'assets', name: '자산', color: C.brand },
  { key: 'liabilities', name: '부채', color: C.teal },
  { key: 'equity', name: '자본', color: C.amber },
]
const REVENUE_SERIES: ChartSeries[] = [
  { key: 'revenue', name: '매출액', color: C.brand },
  { key: 'operatingProfit', name: '영업이익', color: C.teal },
  { key: 'netIncome', name: '당기순이익', color: C.amber },
]

/** 차트↔표 간격(mt-4)을 준 공용 소형 표. */
function MetricTable<T>({
  columns,
  rows,
  rowKey,
}: {
  columns: Column<T>[]
  rows: T[]
  rowKey: (row: T) => string
}) {
  return (
    <div className="mt-4">
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={rowKey}
        numbered={false}
        standardColumns={false}
        layout="fixed"
      />
    </div>
  )
}

function Empty({ text }: { text: string }) {
  return <p className="text-body text-gray-600">{text}</p>
}

/** 투자 현황 표/차트에 그릴 한 행. 외부 라운드(jsonb)와 자사 펀드 투자(관계형)를 합친 표시형. */
interface InvestmentRow {
  date: string
  round?: string | null
  valuation?: number | null
  fundingAmount?: number | null
  investor?: string | null
  /** true면 자사 운용 펀드가 집행한 투자(FUND 원장 연동). */
  isFund?: boolean
  /** 자사 펀드 투자일 때 연결 대상 펀드 id(투자자명 → 펀드 상세 링크). */
  fundId?: string
}

const byDateDesc = (a: InvestmentRow, b: InvestmentRow) =>
  String(b.date ?? '').localeCompare(String(a.date ?? ''))

/**
 * 재무·매출 표의 값 열에 금액 종류(`type: 'money'`)를 적지 않는 이유.
 *
 * 금액 종류의 폭(카드 자리 128px)은 `약정총액 (백만)`처럼 **머리글에 단위를 병기하는** 표를
 * 재어 정한 값이다. 여기서는 단위가 카드 헤더에 한 번만 서고 머리글은 두세 글자라, 그 폭을
 * 그대로 받으면 절반 폭 카드에 네 열이 서면서 표가 카드를 넘겨 가로 스크롤이 생긴다. 종류를
 * 비운 열은 `layout="fixed"`에서 남는 폭을 균등 분할하므로 카드가 좁아져도 표가 넘치지 않는다
 * (값은 백만원 단위로 줄인 서너 자리라 잘릴 여지도 없다). 종류가 정하던 정렬·수치 서식은
 * 사라지는 것이 아니라 열에 그대로 명시한다.
 */
const financeColumns: Column<FinanceEntry>[] = [
  { key: 'year', header: '연도', type: 'date', primary: true, render: (m) => m.year },
  { key: 'assets', header: '자산', align: 'right', numeric: true, render: (m) => <Won v={m.assets} /> },
  { key: 'liabilities', header: '부채', align: 'right', numeric: true, render: (m) => <Won v={m.liabilities} /> },
  { key: 'equity', header: '자본', align: 'right', numeric: true, render: (m) => <Won v={m.equity} /> },
]

const revenueColumns: Column<RevenueEntry>[] = [
  { key: 'year', header: '연도', type: 'date', primary: true, render: (m) => m.year },
  { key: 'revenue', header: '매출액', align: 'right', numeric: true, render: (m) => <Won v={m.revenue} /> },
  { key: 'operatingProfit', header: '영업이익', align: 'right', numeric: true, render: (m) => <Won v={m.operatingProfit} /> },
  { key: 'netIncome', header: '당기순이익', align: 'right', numeric: true, render: (m) => <Won v={m.netIncome} /> },
]

const employeeColumns: Column<EmployeeEntry>[] = [
  { key: 'year', header: '연도', type: 'date', primary: true, render: (m) => m.year },
  {
    key: 'employeeCount',
    header: '고용 인원',
    type: 'count',
    render: (m) => (m.employeeCount == null ? <EmptyValue /> : Number(m.employeeCount).toLocaleString()),
  },
]

const investmentColumns: Column<InvestmentRow>[] = [
  { key: 'date', header: '기준월', type: 'date', primary: true, render: (m) => m.date || <EmptyValue /> },
  { key: 'round', header: '라운드', type: 'text', render: (m) => m.round || <EmptyValue /> },
  { key: 'valuation', header: '기업 가치(Pre)', type: 'money', render: (m) => <Won v={m.valuation} /> },
  { key: 'fundingAmount', header: '투자유치액', type: 'money', render: (m) => <Won v={m.fundingAmount} /> },
  {
    key: 'investor',
    header: '투자자',
    type: 'long',
    render: (m) =>
      m.isFund && m.fundId ? (
        <Link
          to={`/fund/${m.fundId}`}
          title={m.investor ?? ''}
          className="block max-w-[11rem] truncate text-info underline underline-offset-2 hover:text-info/80"
        >
          {m.investor || <EmptyValue />}
        </Link>
      ) : (
        <span className="block max-w-[11rem] truncate" title={m.investor ?? ''}>
          {m.investor || <EmptyValue />}
        </span>
      ),
  },
]

interface Props {
  growth: GrowthMetrics
  /** 스타트업 레코드 id. 있으면 자사 펀드 투자(관계형)를 조회해 투자 현황에 병합한다. */
  startupId?: string
  /** 주주 구성 이력(최신순). 투자 현황 바로 위 칸에 선다. */
  shareholders: ShareholderSnapshot[]
}

/**
 * 실적 지표 카드 묶음(읽기): 재무·매출은 표 + 차트, 나머지는 표만 둔다.
 *
 * 섹션 제목('실적')과 연혁·미디어는 이 컴포넌트가 갖지 않는다 — 밴드의 조립은
 * `StartupPerformanceSection`이 소유하고 여기는 지표 격자만 그린다.
 *
 * 배치 순서는 **출처가 같은 것끼리 짝**을 짓는다.
 *   1행 핵심 지표 | 주요 고객   … 기업 제시(운영 실적)
 *   2행 매출 현황 | 재무 현황   … 재무제표 기준(결과 → 상태 순)
 *   3행 고용 현황 | 주주 구성   … 사람 → 지분
 *   4행 투자 현황(전폭)
 * 트랙션이 매출 위에 서는 이유는 신뢰도순이 아니라 읽는 순서다 — 매출이 0인 초기 기업에서
 * 사실을 말하는 것은 트랙션뿐이고, 빈 표가 먼저 서면 화면이 "아무것도 없다"고 말한다.
 * 값이 드문드문 들어오는 지표는 점 몇 개를 이은 선의 기울기가 추세를 뜻하지 않아
 * 차트가 오히려 잘못된 인상을 준다 — 그래서 고용·투자 카드에는 차트를 두지 않는다.
 * 재무·매출·고용은 연도 기준, 투자는 월 기준으로 각각 독립 목록이다.
 * 투자 현황은 외부 라운드(growth_metrics.investment, jsonb)와 자사 펀드 투자
 * (investments 원장, 브리지 RPC)를 한 표에 합쳐 최신순으로 보여준다. 자사 펀드 행은
 * FUND에서만 편집 가능하므로 여기선 조회만 하며 '자사' 배지로 구분한다.
 * 주주 구성은 투자 현황 **바로 위 칸**에 선다 — 라운드마다 누가 얼마를 넣었는지(투자 현황)와
 * 그래서 지금 지분이 어떻게 나뉘어 있는지(주주 구성)는 같은 사실의 앞뒤라, 떨어져 있으면
 * 아래 표를 읽다 위로 되돌아가야 한다. 투자 현황은 두 칸을 다 받는다(열이 다섯이라 절반 폭에서는
 * 투자자 이름이 먼저 잘린다).
 * 연혁·미디어는 이 격자에 들어오지 않는다 — 밴드의 조립은 StartupPerformanceSection이 갖는다.
 * 편집은 통합 수정 폼에서 관리하므로 카드별 수정 버튼·수정 날짜는 두지 않는다.
 */
export function StartupGrowthCards({ growth, startupId, shareholders }: Props) {
  const { data: fundInvestments } = useStartupFundInvestments(startupId)
  const finance = recent(growth.finance)
  const revenue = recent(growth.revenue)
  const employee = recent(growth.employee)
  // 외부 라운드(자유 입력) + 자사 펀드 투자(관계형)를 병합해 최신 5건.
  const fundRows: InvestmentRow[] = (fundInvestments ?? []).map((f) => ({
    date: (f.invested_at ?? '').slice(0, 7),
    round: f.round,
    valuation: f.valuation,
    fundingAmount: f.amount,
    investor: f.fund_name,
    isFund: true,
    fundId: f.fund_id,
  }))
  const investment = recent([...(growth.investment as InvestmentRow[]), ...fundRows].sort(byDateDesc))
  // 차트는 과거→최신(왼→오른쪽) 순서로 그린다.
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* 핵심 지표·주요 고객(기업 제시): 매출 이전 단계의 증거라 지표 격자 맨 위에 선다. */}
      <StartupTractionCard traction={growth.traction} />
      <StartupCustomerCard customers={growth.customers} />

      {/* 매출 현황 — 결과가 상태(재무)보다 앞선다. */}
      <MetricCard title="매출 현황 (최신 5개년)" unit="재무제표 기준 · 단위: 백만원">
        {revenue.length === 0 ? (
          <Empty text="등록된 매출 정보가 없습니다." />
        ) : (
          <>
          <StartupMetricChart data={[...revenue].reverse()} series={REVENUE_SERIES} />
          <MetricTable columns={revenueColumns} rows={revenue} rowKey={(m) => String(m.year)} />
          </>
        )}
      </MetricCard>

      {/* 재무 현황 */}
      <MetricCard title="재무 현황 (최신 5개년)" unit="재무제표 기준 · 단위: 백만원">
        {finance.length === 0 ? (
          <Empty text="등록된 재무 정보가 없습니다." />
        ) : (
          <>
          <StartupMetricChart data={[...finance].reverse()} series={FINANCE_SERIES} />
          <MetricTable columns={financeColumns} rows={finance} rowKey={(m) => String(m.year)} />
          </>
        )}
      </MetricCard>

      {/* 고용 현황 */}
      <MetricCard title="고용 현황 (최신 5개년)" unit="단위: 명">
        {employee.length === 0 ? (
          <Empty text="등록된 고용 정보가 없습니다." />
        ) : (
          <MetricTable columns={employeeColumns} rows={employee} rowKey={(m) => String(m.year)} />
        )}
      </MetricCard>

      {/* 주주 구성(고용 현황 옆, 투자 현황 위): 변경 시점별 이력형 표 */}
      <StartupShareholderCard history={shareholders} />

      {/* 투자 현황(월 기준, 최신순). 열이 다섯이라 두 칸을 다 받는다. */}
      <div className="lg:col-span-2">
        <MetricCard title="투자 현황 (최신 5건)" unit="단위: 백만원">
          {investment.length === 0 ? (
            <Empty text="등록된 투자 정보가 없습니다." />
          ) : (
            <MetricTable
              columns={investmentColumns}
              rows={investment}
              rowKey={(m) => `${m.date || 'empty'}-${m.round || 'round'}-${m.investor || 'investor'}-${m.fundingAmount ?? 'amount'}`}
            />
          )}
        </MetricCard>
      </div>
    </div>
  )
}
