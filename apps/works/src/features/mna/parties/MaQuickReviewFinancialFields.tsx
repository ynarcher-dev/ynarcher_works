import { Button, Input, PanelCard, cardText } from '@ynarcher/ui'
import { Fragment } from 'react'
import { Label, LineListField, NumberInput, numOrUndef } from '@/components/FormRowFields'
import type {
  QrBsYear,
  QrHighlight,
  QrPnlYear,
  QuickReview,
} from '@/features/mna/parties/quickReview'

/**
 * 퀵 리뷰 편집 — 뒤 세 절(재무 요약 · Valuation · 투자 포인트).
 *
 * **연도 표는 항목 상자로 바꾸지 않는다.** 연도를 세로로 견주며 넣는 입력이라 열이 정렬돼야
 * 작년 값과 올해 값이 눈으로 맞고, 상자로 흩으면 그 비교가 사라진다(스타트업 매출·재무 입력이
 * 같은 이유로 격자를 쓴다). 그래서 이 카드는 폼에서 두 칸을 다 받는다 — 절반 폭에서는 금액
 * 칸이 여덟 자를 담지 못하고 열 정렬이 깨진다.
 *
 * **비율 칸이 없다.** 성장률·이익률·Net debt는 여기 적은 값에서 계산되며 조회가 그때 계산해
 * 세운다. 칸을 만들면 원본을 고쳤을 때 그 칸만 옛 값으로 남는다.
 *
 * 근거: docs/docs_planning/3_6_1_ma_seller_quick_review.md
 */

interface NumCol {
  key: string
  label: string
}

const PNL_COLS: NumCol[] = [
  { key: 'netRevenue', label: '순매출' },
  { key: 'grossProfit', label: '매출총이익' },
  { key: 'ebitda', label: 'EBITDA' },
  { key: 'ebit', label: 'EBIT' },
  { key: 'adjustedEbitda', label: '조정 EBITDA' },
]

const BS_COLS: NumCol[] = [
  { key: 'cash', label: '현금성자산' },
  { key: 'interestBearingDebt', label: '이자부채' },
  { key: 'unpaidTax', label: '미지급세금' },
  { key: 'totalAssets', label: '자산총계' },
  { key: 'totalLiabilities', label: '부채총계' },
  { key: 'totalEquity', label: '자본총계' },
]

/**
 * 연도 기준 숫자 표 편집기. 머리 1행 + 연도별 값 행을 같은 격자에 세워 열이 저절로 맞는다.
 *
 * 스타트업의 `YearMetricGroup`과 같은 모양이되 그 컴포넌트를 그대로 쓰지 않는 것은 행의 연도
 * 칸 이름이 다르기 때문이다(`year` vs `fiscalYear`). 이름을 맞추려고 한쪽 원장의 키를 바꾸는
 * 것은 화면 편의를 위해 저장 규격을 흔드는 일이라 하지 않는다.
 */
function YearTable<T extends { fiscalYear: number }>({
  cols,
  rows,
  setRows,
  addLabel,
}: {
  cols: NumCol[]
  rows: T[]
  setRows: (rows: T[]) => void
  addLabel: string
}) {
  const patch = (i: number, p: Partial<T>) =>
    setRows(rows.map((r, idx) => (idx === i ? { ...r, ...p } : r)))
  const get = (r: T, k: string) => (r as Record<string, number | null | undefined>)[k]
  const gridStyle = { gridTemplateColumns: `5.5rem repeat(${cols.length}, minmax(0,1fr)) auto` }

  return (
    <div className="space-y-2">
      {rows.length > 0 && (
        <div className="grid items-center gap-x-2 gap-y-1.5" style={gridStyle}>
          <span className="text-caption text-gray-700">연도</span>
          {cols.map((c) => (
            <span key={c.key} className="text-caption text-gray-700">
              {c.label}
            </span>
          ))}
          <span aria-hidden />
          {rows.map((r, i) => (
            <Fragment key={i}>
              <Input
                type="number"
                value={r.fiscalYear || ''}
                onChange={(e) =>
                  patch(i, { fiscalYear: numOrUndef(e.target.value) ?? 0 } as Partial<T>)
                }
              />
              {cols.map((c) => (
                <NumberInput
                  key={c.key}
                  value={get(r, c.key)}
                  onChange={(v) => patch(i, { [c.key]: v ?? null } as Partial<T>)}
                />
              ))}
              <Button
                type="button"
                variant="secondary"
                className="shrink-0"
                onClick={() => setRows(rows.filter((_, idx) => idx !== i))}
              >
                삭제
              </Button>
            </Fragment>
          ))}
        </div>
      )}
      <Button
        type="button"
        variant="outline"
        onClick={() => setRows([...rows, { fiscalYear: new Date().getFullYear() } as T])}
      >
        {addLabel}
      </Button>
    </div>
  )
}

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
        help="성장률·이익률·Net debt는 여기 적지 않습니다. 이 표의 값에서 계산되어 조회 화면에 함께 표시됩니다."
      >
        <div className="space-y-4">
          <Label text="손익">
            <YearTable
              cols={PNL_COLS}
              rows={f.pnl}
              setRows={(pnl) => onChange({ ...qr, financials: { ...f, pnl: pnl as QrPnlYear[] } })}
              addLabel="손익 연도 추가"
            />
          </Label>
          <Label text="재무상태표">
            <YearTable
              cols={BS_COLS}
              rows={f.bs}
              setRows={(bs) => onChange({ ...qr, financials: { ...f, bs: bs as QrBsYear[] } })}
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

      {/* 투자 포인트는 묶음마다 제목과 근거 줄을 갖는다. 상자 하나가 곧 한 묶음이라
          `RowBox`(2열 격자)를 쓰지 않는다 — 안에 목록이 들어가 두 칸으로 갈리지 않는다. */}
      <PanelCard title="핵심 투자 포인트" count={qr.highlights.length || undefined}>
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
