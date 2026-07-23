import { Badge, PanelCard, cardText } from '@ynarcher/ui'
import type { ReactNode } from 'react'
import { type GrowthMetrics } from '@/features/startup/startupGrowth'
import { useStartupFundInvestments } from '@/features/fund/hooks'
import { CHART_COLORS, StartupMetricChart, type ChartSeries } from '@/features/startup/StartupMetricChart'
import { MiniTable, td, tdEmpty, tdL, tdP, th, thL } from '@/features/startup/MiniTable'
import { SectionHeading } from '@/features/startup/SectionHeading'

const C = CHART_COLORS

/**
 * 지표 카드 래퍼(제목 + 선택적 단위 표기 + 내용). 수정 버튼·수정 날짜는 두지 않는다(통합 수정으로 관리).
 *
 * 헤더는 공용 `PanelCard`가 소유하고, 단위는 헤더 우측 액션 자리에 놓는다. 한때 이 파일이
 * 공용 `Card`와 같은 이름의 로컬 카드를 따로 갖고 있어 카드 제목이 두 규격으로 갈라졌었다.
 */
function MetricCard({ title, unit, children }: { title: string; unit?: string; children: ReactNode }) {
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
  if (v == null || Number.isNaN(Number(v))) return <span className={tdEmpty}>-</span>
  const n = Math.round(Number(v) / 1_000_000)
  if (n < 0) return <span className="text-info">-{Math.abs(n).toLocaleString()}</span>
  return <span>{n.toLocaleString()}</span>
}

/** 최신 N건만 노출(내림차순으로 이미 정렬됨). */
function recent<T>(list: T[], n = 5): T[] {
  return list.slice(0, n)
}

/** 재무/매출/고용/투자 카드별 막대차트 시리즈 정의. */
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
const EMPLOYEE_SERIES: ChartSeries[] = [{ key: 'employeeCount', name: '고용 인원', color: C.brand }]
const INVESTMENT_SERIES: ChartSeries[] = [
  { key: 'valuation', name: '기업 가치(Pre)', color: C.brand },
  { key: 'fundingAmount', name: '투자유치액', color: C.teal },
]

/** 차트↔표 간격(mt-4)을 준 공용 소형 표. */
function Table({ head, children }: { head: ReactNode; children: ReactNode }) {
  return (
    <MiniTable className="mt-4" head={head}>
      {children}
    </MiniTable>
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
}

const byDateDesc = (a: InvestmentRow, b: InvestmentRow) =>
  String(b.date ?? '').localeCompare(String(a.date ?? ''))

interface Props {
  growth: GrowthMetrics
  /** 스타트업 레코드 id. 있으면 자사 펀드 투자(관계형)를 조회해 투자 현황에 병합한다. */
  startupId?: string
}

/**
 * 성장 지표 섹션(읽기): 재무/매출/고용/투자 현황 표 + 차트.
 * 재무·매출·고용은 연도 기준, 투자는 월 기준으로 각각 독립 목록이다.
 * 투자 현황은 외부 라운드(growth_metrics.investment, jsonb)와 자사 펀드 투자
 * (investments 원장, 브리지 RPC)를 한 표에 합쳐 최신순으로 보여준다. 자사 펀드 행은
 * FUND에서만 편집 가능하므로 여기선 조회만 하며 '자사' 배지로 구분한다.
 * 연혁은 별도 카드(StartupBusinessTimeline)로 분리해 주주 구성 아래에 둔다.
 * 편집은 통합 수정 폼에서 관리하므로 카드별 수정 버튼·수정 날짜는 두지 않는다.
 */
export function StartupGrowthSection({ growth, startupId }: Props) {
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
  }))
  const investment = recent([...(growth.investment as InvestmentRow[]), ...fundRows].sort(byDateDesc))
  // 차트는 과거→최신(왼→오른쪽) 순서로 그린다.
  return (
    <section className="space-y-4">
      {/* 그룹 헤드라인 + 구분선: 위 블록(비즈니스 & 팀 역량)과 성장 지표 묶음을 시각적으로 분리 */}
      <SectionHeading title="성장 지표" />

      <div className="grid gap-4 lg:grid-cols-2">
        {/* 재무 현황 */}
        <MetricCard title="재무 현황 (최신 5개년)" unit="단위: 백만원">
          {finance.length === 0 ? (
            <Empty text="등록된 재무 정보가 없습니다." />
          ) : (
            <>
            <StartupMetricChart data={[...finance].reverse()} series={FINANCE_SERIES} />
            <Table head={<><th className={thL}>연도</th><th className={th}>자산</th><th className={th}>부채</th><th className={th}>자본</th></>}>
              {finance.map((m) => (
                <tr key={m.year}>
                  <td className={tdP}>{m.year}</td>
                  <td className={td}><Won v={m.assets} /></td>
                  <td className={td}><Won v={m.liabilities} /></td>
                  <td className={td}><Won v={m.equity} /></td>
                </tr>
              ))}
            </Table>
            </>
          )}
        </MetricCard>

        {/* 매출 현황 */}
        <MetricCard title="매출 현황 (최신 5개년)" unit="단위: 백만원">
          {revenue.length === 0 ? (
            <Empty text="등록된 매출 정보가 없습니다." />
          ) : (
            <>
            <StartupMetricChart data={[...revenue].reverse()} series={REVENUE_SERIES} />
            <Table head={<><th className={thL}>연도</th><th className={th}>매출액</th><th className={th}>영업이익</th><th className={th}>당기순이익</th></>}>
              {revenue.map((m) => (
                <tr key={m.year}>
                  <td className={tdP}>{m.year}</td>
                  <td className={td}><Won v={m.revenue} /></td>
                  <td className={td}><Won v={m.operatingProfit} /></td>
                  <td className={td}><Won v={m.netIncome} /></td>
                </tr>
              ))}
            </Table>
            </>
          )}
        </MetricCard>

        {/* 고용 현황 */}
        <MetricCard title="고용 현황 (최신 5개년)" unit="단위: 명">
          {employee.length === 0 ? (
            <Empty text="등록된 고용 정보가 없습니다." />
          ) : (
            <>
            <StartupMetricChart data={[...employee].reverse()} series={EMPLOYEE_SERIES} unit="count" variant="line" />
            <Table head={<><th className={thL}>연도</th><th className={th}>고용 인원</th></>}>
              {employee.map((m) => (
                <tr key={m.year}>
                  <td className={tdP}>{m.year}</td>
                  <td className={td}>
                    {m.employeeCount == null ? <span className={tdEmpty}>-</span> : Number(m.employeeCount).toLocaleString()}
                  </td>
                </tr>
              ))}
            </Table>
            </>
          )}
        </MetricCard>

        {/* 투자 현황(월 기준, 최신순) */}
        <MetricCard title="투자 현황 (최신 5건)" unit="단위: 백만원">
          {investment.length === 0 ? (
            <Empty text="등록된 투자 정보가 없습니다." />
          ) : (
            <>
            <StartupMetricChart data={[...investment].reverse()} series={INVESTMENT_SERIES} variant="line" xKey="date" />
            <Table head={<><th className={thL}>기준월</th><th className={thL}>라운드</th><th className={th}>기업 가치(Pre)</th><th className={th}>투자유치액</th><th className={thL}>투자자</th></>}>
              {investment.map((m, i) => (
                <tr key={`${m.date}-${i}`}>
                  <td className={tdP}>{m.date || '-'}</td>
                  <td className={tdL}>{m.round || '-'}</td>
                  <td className={td}><Won v={m.valuation} /></td>
                  <td className={td}><Won v={m.fundingAmount} /></td>
                  <td className={tdL}>
                    {m.isFund ? (
                      <span className="inline-flex items-center gap-1">
                        <Badge tone="info">자사</Badge>
                        {m.investor || '-'}
                      </span>
                    ) : (
                      m.investor || '-'
                    )}
                  </td>
                </tr>
              ))}
            </Table>
            </>
          )}
        </MetricCard>
      </div>
    </section>
  )
}
