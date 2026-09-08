import { PanelCard, cardText } from '@ynarcher/ui'
import type { QuickReview } from '@/features/mna/parties/quickReview'
import { MaQuickReviewMetricTable } from '@/features/mna/parties/MaQuickReviewMetricTable'
import { BS_ROWS, PNL_ROWS } from '@/features/mna/parties/quickReviewMetrics'
import { QrBlock, QrBullets, QrNote } from '@/features/mna/parties/MaQuickReviewParts'

/**
 * 퀵 리뷰의 뒤 세 절 — 재무 요약(손익계산서·재무상태표) · Valuation · 투자 포인트.
 *
 * ## 배치는 원본 문서 그대로다 — 항목이 행, 연도가 열
 *
 * 한동안 연도를 행으로 눕혔다(이 앱의 열 폭 규칙이 행 단위 표를 전제한다는 근거였다). 그러나
 * 그 배치에서 재무상태표는 여덟 열짜리 표가 되고, 이 카드는 상세의 좌측 2/3 칸에 놓이므로
 * 1280px 화면에서 값 열 하나에 56px밖에 돌아가지 않아 머리글과 숫자가 함께 잘렸다. 문서의
 * 배치로 되돌리면 열 수가 `항목 + 연도 수`가 되어 네 개년 문서가 다섯 열로 선다 —
 * **배치를 바꾸는 것만으로 폭 문제가 사라진다.**
 *
 * 덤이 더 크다. 비율(`% growth`·`margin %`)이 값 칸에 얹힌 둘째 줄이 아니라 자기 행을 가지므로,
 * 한 해의 이익률을 옆 해와 가로로 견줄 수 있다 — 재무제표를 읽는 방식이 원래 그것이다.
 *
 * 대신 연도가 아주 많은 문서(상한 10개년)에서는 열이 열한 개까지 늘어난다. 그때는 표가 잘리는
 * 대신 가로로 스크롤한다 — 잘린 숫자는 짧아진 값이 아니라 틀린 값이므로, 둘 중 하나를 골라야
 * 하면 스크롤이 답이다.
 *
 * ## 계산되는 값은 저장하지 않는다
 *
 * `% growth`·`margin %`·`Net debt`는 원장에 없고 표의 값에서 매번 계산된다. 무엇이 계산되는
 * 값인지는 화면이 아니라 행 정의(`quickReviewMetrics.ts`)가 답하며, 편집 격자가 그 같은 정의를
 * 읽어 그 칸을 입력이 아니라 계산 결과로 세운다.
 *
 * 근거: docs/docs_planning/3_6_1_ma_seller_quick_review.md
 */
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
          help="연하게 선 행(% growth · margin % · Net debt)은 저장된 값이 아니라 이 표의 값에서 계산된 것입니다. % growth는 전년 대비 증감률, margin %는 순매출 대비 비율, Net debt는 이자부채 − 현금입니다."
          bodyClassName="space-y-4"
        >
          <MaQuickReviewMetricTable title="손익계산서" years={f.pnl} specs={PNL_ROWS} />
          <MaQuickReviewMetricTable title="재무상태표" years={f.bs} specs={BS_ROWS} />
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
        <PanelCard title="핵심 포인트" count={qr.highlights.length} bodyClassName="space-y-4">
          {/* 묶음 하나가 곧 세부 항목 하나다 — 제목과 근거 줄의 간격이 다른 카드의 소제목과
              같은 값이어야 문서 전체가 한 규격으로 읽힌다. */}
          {qr.highlights.map((h, i) => (
            <QrBlock key={`${h.title}-${i}`} title={h.title}>
              <QrBullets lines={h.bullets} />
            </QrBlock>
          ))}
        </PanelCard>
      )}
    </>
  )
}
