import { InfoField, InfoGrid, InfoRows, PanelCard, StatStrip, cardText } from '@ynarcher/ui'
import {
  financialSummary,
  type QuickReview,
  type QrFinancialSummary,
} from '@/features/mna/parties/quickReview'
import { QrBullets, QrNote, million } from '@/features/mna/parties/MaQuickReviewParts'

/**
 * 퀵 리뷰의 앞 네 절 — 한줄 요약 · 주요내용 · 회사 소개 · 제품·서비스.
 *
 * 뒤 세 절(재무·Valuation·투자 포인트)과 파일을 가른 기준은 화면의 자리가 아니라 **읽는
 * 방식**이다. 앞은 서술이라 문장으로 읽고, 뒤는 표라 숫자를 세로로 견준다. 한 파일에 두면
 * 표의 규격을 손볼 때마다 서술의 조판이 함께 흔들린다.
 *
 * 근거: docs/docs_planning/3_6_1_ma_seller_quick_review.md
 */

/**
 * 요약재무 — **재무 절의 가장 최근 회계연도를 되읽은 값**이다.
 *
 * 여기에 따로 저장된 숫자가 없다는 것이 요점이다. 문서가 이 자리에 자산·부채·자본·매출을
 * 인쇄하지만 그것은 뒤 표의 마지막 열과 같은 숫자이고, 두 곳에 적으면 한쪽만 고쳐 어긋난다.
 */
function summaryFinanceLabel(s: QrFinancialSummary): string {
  // 단위는 라벨이 한 번 답한다 — 값마다 '백만원'을 붙이면 그 글자가 숫자보다 길어진다.
  return `요약재무 (${s.fiscalYear}년, 백만원)`
}

function summaryFinanceText(s: QrFinancialSummary): string | null {
  const parts: Array<[string, number | null]> = [
    ['자산', s.assets],
    ['부채', s.liabilities],
    ['자본', s.equity],
    ['매출', s.revenue],
    ['EBITDA', s.ebitda],
    ['조정 EBITDA', s.adjustedEbitda],
  ]
  const text = parts
    .filter(([, v]) => v != null)
    .map(([label, v]) => `${label} ${million(v)}`)
    .join(' · ')
  return text === '' ? null : text
}

export function MaQuickReviewNarrative({ qr }: { qr: QuickReview }) {
  const fin = financialSummary(qr.financials)
  const b = qr.basics
  const intro = qr.intro
  const products = qr.products

  return (
    <>
      {/* 한줄 요약은 카드를 갖지 않는다 — 문서의 첫 줄이라 제목을 얹으면 '한줄 요약'이라는
          라벨이 정작 그 한 줄보다 먼저 읽힌다. 대신 한 단 굵게 세워 뒤 절과 무게를 가른다. */}
      {qr.summary.headline && (
        <p className={`${cardText.value} font-semibold`}>{qr.summary.headline}</p>
      )}

      {/* 주요내용 — 짧은 값은 InfoGrid, 길어 세로로 쌓이는 값(사업내용·주주구성)은 InfoRows.
          한 카드 안에서 라벨 축을 둘 이상 만들지 않는다(CLAUDE.md 상호참조 규칙). */}
      <PanelCard title="주요내용">
        <InfoGrid>
          <InfoField label="회사명" value={b.companyName} />
          <InfoField label="설립일" value={b.foundedOn} />
          <InfoField label="본사 소재지" value={b.headquarters} />
          <InfoField label="대표자" value={b.representative} />
        </InfoGrid>
        <div className="mt-3">
          <InfoRows
            items={[
              { label: '사업내용', value: b.businessDescription },
              {
                // 기준 시점은 라벨에 붙인다 — 지분율 옆에 적으면 주주마다 반복되고,
                // 값 아래 따로 적으면 무엇의 시점인지 한 번 더 물어야 한다.
                label: b.shareholdersAsOf ? `주주구성 (${b.shareholdersAsOf})` : '주주구성',
                value:
                  b.shareholders.length === 0
                    ? null
                    : b.shareholders
                        .map((s) => (s.ratio == null ? s.name : `${s.name} (${s.ratio}%)`))
                        .join(', '),
              },
              // 요약재무도 같은 라벨 축에 세운다 — 한 카드 안에서 라벨 축이 둘이 되면
              // 같은 값들이 서로 다른 들여쓰기로 서서 무엇이 같은 층인지 알 수 없다.
              ...(fin ? [{ label: summaryFinanceLabel(fin), value: summaryFinanceText(fin) }] : []),
            ]}
          />
        </div>
        <QrNote text={b.note} />
      </PanelCard>

      {/* 회사 소개 — 지표 타일은 공용 `StatStrip`이 규격을 소유한다. 문서가 네 칸으로 세우는
          자리라 격자만 4열로 바꾼다(칸 수는 화면마다 다르다는 것이 그 컴포넌트의 전제다). */}
      {(intro.metrics.length > 0 || intro.body || intro.bullets.length > 0) && (
        <PanelCard title="회사 소개">
          {intro.metrics.length > 0 && (
            <div className="mb-3">
              <StatStrip
                className="grid grid-cols-2 divide-gray-200 sm:grid-cols-4 sm:divide-x"
                tiles={intro.metrics.map((m, i) => ({
                  key: `${m.label}-${i}`,
                  label: m.label,
                  value: m.value,
                }))}
              />
            </div>
          )}
          {intro.body && <p className={cardText.value}>{intro.body}</p>}
          <QrBullets lines={intro.bullets} />
        </PanelCard>
      )}

      {/* 제품·서비스 — 제품별 실적은 라벨:값 두 칸이라 표가 아니라 InfoRows다.
          표로 세우면 두 열짜리 표 하나를 위해 머리줄과 번호 열이 붙는다. */}
      {(products.body || products.items.length > 0 || products.bullets.length > 0) && (
        <PanelCard title="제품·서비스">
          {products.body && <p className={cardText.value}>{products.body}</p>}
          {products.items.length > 0 && (
            <div className="mt-3">
              <InfoRows
                items={products.items.map((p) => ({ label: p.product, value: p.achievement }))}
              />
            </div>
          )}
          <QrBullets lines={products.bullets} />
          <QrNote text={products.note} />
        </PanelCard>
      )}
    </>
  )
}
