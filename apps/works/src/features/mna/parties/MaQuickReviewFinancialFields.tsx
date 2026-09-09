import { Button, Input, PanelCard, cardText } from '@ynarcher/ui'
import { Label, LineListField } from '@/components/FormRowFields'
import type {
  QrBsYear,
  QrHighlight,
  QrPnlYear,
  QuickReview,
} from '@/features/mna/parties/quickReview'
import { MaQuickReviewMetricGrid } from '@/features/mna/parties/MaQuickReviewMetricGrid'
import { BS_ROWS, PNL_ROWS } from '@/features/mna/parties/quickReviewMetrics'

/**
 * 퀵 리뷰 편집 — 뒤 세 절(재무 요약 · Valuation · 투자 포인트).
 *
 * **재무 표는 조회와 같은 배치다** — 항목이 행, 연도가 열(2026-09-08). 적을 때와 읽을 때의 축이
 * 다르면 방금 `2024년 EBITDA` 칸에 넣은 숫자가 조회에서 어느 칸으로 갔는지 눈이 매번 다시
 * 찾는다. 격자와 행 정의는 조회와 같은 부품·같은 목록을 쓴다.
 *
 * **계산되는 칸에는 입력 상자가 없다.** `% growth`·`margin %`·`Net debt`는 지금 적힌 값으로
 * 즉시 계산되어 회색 칸에 선다 — 적어 넣을 칸을 만들면 원본을 고쳤을 때 그 칸만 옛 값으로
 * 남는다. 조회에서만 계산해 보이던 것을 편집으로 끌어온 이유는, 값을 넣는 그 순간에 이익률이
 * 맞게 나오는지 확인해야 잘못 적은 자릿수를 바로 알아채기 때문이다.
 *
 * 근거: docs/docs_planning/3_6_1_ma_seller_quick_review.md
 */
export function MaQuickReviewFinancialFields({
  qr,
  onChange,
}: {
  qr: QuickReview
  onChange: (next: QuickReview) => void
}) {
  const f = qr.financials

  return (
    <>
      {/* 단위는 카드 헤더가 한 번 답한다 — 열마다 붙이면 머리글이 값보다 길어진다. */}
      <PanelCard
        title="재무 요약"
        action={<span className={`shrink-0 ${cardText.subtitle}`}>(백만원)</span>}
        help="회색 칸(% growth · margin % · Net debt)은 적는 칸이 아니라 이 표의 값에서 계산된 결과입니다. 값을 고치면 즉시 다시 계산됩니다."
      >
        <div className="space-y-4">
          <Label text="손익계산서">
            <MaQuickReviewMetricGrid
              specs={PNL_ROWS}
              years={f.pnl}
              setYears={(pnl) => onChange({ ...qr, financials: { ...f, pnl: pnl as QrPnlYear[] } })}
              addLabel="손익 연도 추가"
            />
          </Label>
          <Label text="재무상태표">
            <MaQuickReviewMetricGrid
              specs={BS_ROWS}
              years={f.bs}
              setYears={(bs) => onChange({ ...qr, financials: { ...f, bs: bs as QrBsYear[] } })}
              addLabel="재무상태표 연도 추가"
            />
          </Label>
          <Label text="단서 (주)">
            <Input
              value={f.note ?? ''}
              placeholder="예: 25년 재무자료는 未감사 기준 · 조정 EBITDA는 일회성 비용 조정"
              onChange={(e) => onChange({ ...qr, financials: { ...f, note: e.target.value } })}
            />
          </Label>
        </div>
      </PanelCard>

      <PanelCard
        title="Valuation"
        help="가정과 결과를 한 줄에 함께 적습니다. 결과만 적으면 확정된 값으로 읽힙니다."
      >
        <LineListField
          lines={qr.valuation.bullets}
          placeholder="예: EV/EBITDA 8배 적용 시 EV 960억"
          onChange={(bullets) => onChange({ ...qr, valuation: { bullets } })}
          addLabel="줄 추가"
        />
      </PanelCard>

      {/* 투자 포인트는 묶음마다 제목과 **근거 줄 목록**을 갖는다. 한 항목이 한 줄에 담기지
          않으므로 여기만 상자로 감싼다 — `ItemRows`는 한 줄에 서는 목록의 규격이다. */}
      <PanelCard title="핵심 포인트" count={qr.highlights.length || undefined}>
        <div className="space-y-2">
          {qr.highlights.map((h, i) => (
            <section key={i} className="space-y-2 rounded-radius-md border border-gray-200 p-3">
              <div className="flex items-center gap-2">
                <Input
                  value={h.title}
                  placeholder="예: 압도적 시장 지배력"
                  onChange={(e) =>
                    onChange({
                      ...qr,
                      highlights: qr.highlights.map((x, idx) =>
                        idx === i ? { ...x, title: e.target.value } : x,
                      ),
                    })
                  }
                />
                <Button
                  type="button"
                  variant="secondary"
                  className="shrink-0"
                  onClick={() =>
                    onChange({ ...qr, highlights: qr.highlights.filter((_, idx) => idx !== i) })
                  }
                >
                  삭제
                </Button>
              </div>
              <LineListField
                lines={h.bullets}
                placeholder="수치나 확인 가능한 사실이 하나는 있는 줄"
                onChange={(bullets) =>
                  onChange({
                    ...qr,
                    highlights: qr.highlights.map((x, idx) => (idx === i ? { ...x, bullets } : x)),
                  })
                }
                addLabel="근거 줄 추가"
              />
            </section>
          ))}
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              onChange({
                ...qr,
                highlights: [...qr.highlights, { title: '', bullets: [] } as QrHighlight],
              })
            }
          >
            포인트 추가
          </Button>
        </div>
      </PanelCard>
    </>
  )
}
