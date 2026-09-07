import { DataTable, EmptyValue, PanelCard, cardText, type Column } from '@ynarcher/ui'
import {
  growthPct,
  marginPct,
  netDebt,
  type QrBsYear,
  type QrPnlYear,
  type QuickReview,
} from '@/features/mna/parties/quickReview'
import { AmountWithRate, QrBullets, QrNote, million } from '@/features/mna/parties/MaQuickReviewParts'

/**
 * 퀵 리뷰의 뒤 세 절 — 재무 요약(손익·재무상태표) · Valuation · 투자 포인트.
 *
 * ## 왜 연도가 행인가
 *
 * 원본 문서는 연도를 **열**로 세운다(FY22A … FY25A). 그 모양이 재무 관례이긴 하나, 여기서는
 * 연도를 행으로 눕힌다. 이유는 셋이다 — 표의 열 폭을 담기는 값의 종류가 정한다는 이 앱의
 * 규칙(`ColumnType`)이 행 단위 표를 전제하고, 연도가 늘면 열이 늘어 좁은 카드에서 가로
 * 스크롤이 생기며(가로 스크롤은 이 앱이 표에서 피하는 것이다), 무엇보다 STARTUP 상세의
 * 매출·재무 표가 이미 같은 규격이라 두 화면을 오가는 눈이 같은 자리를 찾는다.
 *
 * ## 비율은 값 아래 한 줄로 붙는다
 *
 * 문서는 값 행 아래에 `margin %` 행을 따로 둔다. 여기서는 그 비율이 **그 값에만 딸린 값**이라
 * 같은 칸 안에 작은 줄로 세운다 — 열을 갈라 두면 열이 배로 늘고, 행으로 갈라 두면 연도마다
 * 행이 배로 는다. 비율은 어디에도 저장되지 않고 매번 계산된다(quickReview.ts).
 *
 * 근거: docs/docs_planning/3_6_1_ma_seller_quick_review.md
 */

/** 손익 한 행 — 앞 해를 함께 들고 온다(성장률은 앞 해가 있어야 계산된다). */
interface PnlRow extends QrPnlYear {
  previousNetRevenue: number | null
}

/**
 * 값 열에 `type: 'money'`를 적지 않는 이유는 STARTUP 재무 표와 같다 — 금액 종류의 고정폭은
 * 머리글에 단위를 병기하는 표를 재어 정한 값이라, 단위가 카드 헤더에 한 번만 서는 이 표에서는
 * 열이 필요 이상으로 넓어진다. 종류가 정하던 정렬·수치 서식은 열에 그대로 명시한다.
 */
const pnlColumns: Column<PnlRow>[] = [
  { key: 'fiscalYear', header: '연도', type: 'date', primary: true, render: (r) => `${r.fiscalYear}` },
  {
    key: 'netRevenue',
    header: '순매출',
    align: 'right',
    numeric: true,
    // 순매출 아래 붙는 비율만 '전년 대비'다(나머지는 순매출 대비). 라벨을 달지 않아도
    // 읽히는 것은 그 자리가 매출 열이기 때문이고, 머리글 도움말이 그 사실을 답한다.
    render: (r) => <AmountWithRate value={r.netRevenue} rate={growthPct(r.netRevenue, r.previousNetRevenue)} />,
  },
  {
    key: 'grossProfit',
    header: '매출총이익',
    align: 'right',
    numeric: true,
    render: (r) => <AmountWithRate value={r.grossProfit} rate={marginPct(r.grossProfit, r.netRevenue)} />,
  },
  {
    key: 'ebitda',
    header: 'EBITDA',
    align: 'right',
    numeric: true,
    render: (r) => <AmountWithRate value={r.ebitda} rate={marginPct(r.ebitda, r.netRevenue)} />,
  },
  {
    key: 'ebit',
    header: 'EBIT',
    align: 'right',
    numeric: true,
    render: (r) => <AmountWithRate value={r.ebit} rate={marginPct(r.ebit, r.netRevenue)} />,
  },
  {
    key: 'adjustedEbitda',
    header: '조정 EBITDA',
    align: 'right',
    numeric: true,
    render: (r) => (
      <AmountWithRate value={r.adjustedEbitda} rate={marginPct(r.adjustedEbitda, r.netRevenue)} />
    ),
  },
]

const bsColumns: Column<QrBsYear>[] = [
  { key: 'fiscalYear', header: '연도', type: 'date', primary: true, render: (r) => `${r.fiscalYear}` },
  { key: 'cash', header: '현금성자산', align: 'right', numeric: true, render: (r) => million(r.cash) },
  {
    key: 'interestBearingDebt',
    header: '이자부채',
    align: 'right',
    numeric: true,
    render: (r) => million(r.interestBearingDebt),
  },
  {
    key: 'netDebt',
    header: 'Net debt',
    align: 'right',
    numeric: true,
    // 저장되지 않는 값이다 — 이자부채 − 현금이며 문서 자신이 그 정의를 적어 둔다.
    render: (r) => (netDebt(r) == null ? <EmptyValue /> : million(netDebt(r))),
  },
  { key: 'unpaidTax', header: '미지급세금', align: 'right', numeric: true, render: (r) => million(r.unpaidTax) },
  {
    key: 'totalAssets',
    header: '자산총계',
    align: 'right',
    numeric: true,
    render: (r) => million(r.totalAssets),
  },
  {
    key: 'totalLiabilities',
    header: '부채총계',
    align: 'right',
    numeric: true,
    render: (r) => million(r.totalLiabilities),
  },
  {
    key: 'totalEquity',
    header: '자본총계',
    align: 'right',
    numeric: true,
    render: (r) => million(r.totalEquity),
  },
]

/** 앞 해를 붙인다 — 첫 해는 비교 대상이 없어 성장률이 서지 않는 것이 사실이다. */
function withPrevious(pnl: QrPnlYear[]): PnlRow[] {
  return pnl.map((row, i) => ({ ...row, previousNetRevenue: pnl[i - 1]?.netRevenue ?? null }))
}

export function MaQuickReviewFinancials({ qr }: { qr: QuickReview }) {
  const f = qr.financials
  const hasFinancials = f.pnl.length + f.bs.length > 0

  return (
    <>
      {hasFinancials && (
        // 단위는 카드 헤더가 한 번 답한다 — 머리글마다 붙이면 열이 그만큼 좁아진다.
        <PanelCard
          title="재무 요약"
          action={<span className={`shrink-0 ${cardText.subtitle}`}>(백만원)</span>}
          help="값 아래 작은 줄은 비율입니다. 순매출은 전년 대비 증감률, 나머지는 순매출 대비 비율이며 어느 것도 저장되지 않고 표의 값에서 계산됩니다."
        >
          {f.pnl.length > 0 && (
            <DataTable
              columns={pnlColumns}
              rows={withPrevious(f.pnl)}
              rowKey={(r) => `pnl-${r.fiscalYear}`}
              numbered={false}
              standardColumns={false}
              layout="fixed"
            />
          )}
          {f.bs.length > 0 && (
            <div className={f.pnl.length > 0 ? 'mt-4' : undefined}>
              <p className={`mb-1.5 ${cardText.subhead}`}>재무상태표</p>
              <DataTable
                columns={bsColumns}
                rows={f.bs}
                rowKey={(r) => `bs-${r.fiscalYear}`}
                numbered={false}
                standardColumns={false}
                layout="fixed"
              />
            </div>
          )}
          <QrNote text={f.note} />
        </PanelCard>
      )}

      {qr.valuation.bullets.length > 0 && (
        <PanelCard title="Valuation">
          <QrBullets lines={qr.valuation.bullets} />
        </PanelCard>
      )}

      {/* 투자 포인트는 묶음마다 제목과 근거 줄을 갖는다. 제목을 카드로 쪼개지 않는 이유는
          한 절의 항목들이라 나란히 읽혀야 하고, 카드로 쪼개면 다섯 장의 상자가 문서 끝을
          가득 채워 앞 절들과 무게가 뒤집힌다. */}
      {qr.highlights.length > 0 && (
        <PanelCard title="핵심 투자 포인트" count={qr.highlights.length}>
          <div className="space-y-3">
            {qr.highlights.map((h, i) => (
              <section key={`${h.title}-${i}`}>
                <p className={cardText.subhead}>{h.title}</p>
                <QrBullets lines={h.bullets} />
              </section>
            ))}
          </div>
        </PanelCard>
      )}
    </>
  )
}
