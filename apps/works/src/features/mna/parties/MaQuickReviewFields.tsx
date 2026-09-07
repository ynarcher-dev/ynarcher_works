import { Button, Input, PanelCard, TextArea } from '@ynarcher/ui'
import {
  Cell,
  Label,
  LineListField,
  NumberInput,
  RowActions,
  RowBox,
} from '@/components/FormRowFields'
import type { QuickReview } from '@/features/mna/parties/quickReview'

/**
 * 퀵 리뷰 편집 — 앞 네 절(한줄 요약 · 주요내용 · 회사 소개 · 제품·서비스).
 *
 * **조회와 같은 카드 구성으로 선다.** 카드 단위·순서뿐 아니라 제목까지 같다 — 방금 적은 값이
 * 어느 카드로 가는지 화면이 답해야 하고, '수정'을 눌렀을 때 카드가 재배치되면 눈이 자리를
 * 다시 찾아야 한다(스타트업 편집 폼이 2026-09-06에 같은 이유로 카드를 쪼갰다).
 *
 * **요약재무를 적는 칸이 없다.** 그 값은 재무 절의 가장 최근 연도이고 조회가 그것을 되읽는다 —
 * 여기에 칸을 만들면 같은 숫자를 두 번 적게 되고, 한쪽만 고친 날 어느 쪽이 사실인지 답할
 * 근거가 없다.
 *
 * 근거: docs/docs_planning/3_6_1_ma_seller_quick_review.md
 */
export function MaQuickReviewFields({
  qr,
  onChange,
}: {
  qr: QuickReview
  onChange: (next: QuickReview) => void
}) {
  const patch = <K extends keyof QuickReview>(key: K, value: QuickReview[K]) =>
    onChange({ ...qr, [key]: value })
  const b = qr.basics
  const intro = qr.intro
  const products = qr.products

  return (
    <>
      <PanelCard
        title="한줄 요약"
        help="문서의 첫 줄입니다. 무엇을 하는 회사인지 · 시장에서의 위치 · 최근 실적을 한 문장에 담습니다."
      >
        <TextArea
          rows={2}
          value={qr.summary.headline ?? ''}
          placeholder="예: 국내 RTD 하이볼 점유율 61.4%의 1위 사업자로, FY25 매출 557억(+31.2%) 달성"
          onChange={(e) => patch('summary', { headline: e.target.value })}
        />
      </PanelCard>

      <PanelCard title="주요내용">
        {/* 짧은 값 넷은 2열, 긴 값(사업내용)과 목록(주주구성)은 아래로 내려 전폭을 받는다.
            폭은 그 칸이 받는 입력이 정한다 — 회사명·설립일은 절반이면 충분하고, 사업내용은
            절반 폭에서 두 줄이 세 줄로 접힌다. */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Label text="회사명">
            <Input
              value={b.companyName ?? ''}
              onChange={(e) => patch('basics', { ...b, companyName: e.target.value })}
            />
          </Label>
          <Label text="설립일">
            <Input
              value={b.foundedOn ?? ''}
              placeholder="예: 2017년"
              onChange={(e) => patch('basics', { ...b, foundedOn: e.target.value })}
            />
          </Label>
          <Label text="본사 소재지">
            <Input
              value={b.headquarters ?? ''}
              placeholder="예: 서울사무소 / 가평·파주공장"
              onChange={(e) => patch('basics', { ...b, headquarters: e.target.value })}
            />
          </Label>
          <Label text="대표자">
            <Input
              value={b.representative ?? ''}
              onChange={(e) => patch('basics', { ...b, representative: e.target.value })}
            />
          </Label>
        </div>
        <div className="mt-3 space-y-3">
          <Label text="사업내용">
            <TextArea
              rows={2}
              value={b.businessDescription ?? ''}
              onChange={(e) => patch('basics', { ...b, businessDescription: e.target.value })}
            />
          </Label>
          <Label text="주주구성 기준 시점">
            <Input
              value={b.shareholdersAsOf ?? ''}
              placeholder="예: 딜 전, '26.5월 말 기준"
              onChange={(e) => patch('basics', { ...b, shareholdersAsOf: e.target.value })}
            />
          </Label>
          <Label text="주주구성">
            <div className="space-y-2">
              {b.shareholders.map((s, i) => (
                <RowBox key={i}>
                  <Cell label="주주명">
                    <Input
                      value={s.name}
                      onChange={(e) =>
                        patch('basics', {
                          ...b,
                          shareholders: b.shareholders.map((x, idx) =>
                            idx === i ? { ...x, name: e.target.value } : x,
                          ),
                        })
                      }
                    />
                  </Cell>
                  <Cell label="지분율 (%)">
                    <NumberInput
                      value={s.ratio}
                      onChange={(v) =>
                        patch('basics', {
                          ...b,
                          shareholders: b.shareholders.map((x, idx) =>
                            idx === i ? { ...x, ratio: v ?? null } : x,
                          ),
                        })
                      }
                    />
                  </Cell>
                  <RowActions>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() =>
                        patch('basics', {
                          ...b,
                          shareholders: b.shareholders.filter((_, idx) => idx !== i),
                        })
                      }
                    >
                      삭제
                    </Button>
                  </RowActions>
                </RowBox>
              ))}
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  patch('basics', { ...b, shareholders: [...b.shareholders, { name: '', ratio: null }] })
                }
              >
                주주 추가
              </Button>
            </div>
          </Label>
          <Label text="단서 (주)">
            <Input
              value={b.note ?? ''}
              placeholder="예: 25년 재무자료는 未감사 기준"
              onChange={(e) => patch('basics', { ...b, note: e.target.value })}
            />
          </Label>
        </div>
      </PanelCard>

      <PanelCard title="회사 소개">
        <div className="space-y-3">
          <Label text="핵심 지표">
            <div className="space-y-2">
              {intro.metrics.map((m, i) => (
                <RowBox key={i}>
                  <Cell label="지표 이름">
                    <Input
                      value={m.label}
                      placeholder="예: 국내 RTD 점유율"
                      onChange={(e) =>
                        patch('intro', {
                          ...intro,
                          metrics: intro.metrics.map((x, idx) =>
                            idx === i ? { ...x, label: e.target.value } : x,
                          ),
                        })
                      }
                    />
                  </Cell>
                  <Cell label="값 (단위 포함)">
                    <Input
                      value={m.value}
                      placeholder="예: 61.4%"
                      onChange={(e) =>
                        patch('intro', {
                          ...intro,
                          metrics: intro.metrics.map((x, idx) =>
                            idx === i ? { ...x, value: e.target.value } : x,
                          ),
                        })
                      }
                    />
                  </Cell>
                  <RowActions>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() =>
                        patch('intro', {
                          ...intro,
                          metrics: intro.metrics.filter((_, idx) => idx !== i),
                        })
                      }
                    >
                      삭제
                    </Button>
                  </RowActions>
                </RowBox>
              ))}
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  patch('intro', { ...intro, metrics: [...intro.metrics, { label: '', value: '' }] })
                }
              >
                지표 추가
              </Button>
            </div>
          </Label>
          <Label text="소개 본문">
            <TextArea
              rows={3}
              value={intro.body ?? ''}
              onChange={(e) => patch('intro', { ...intro, body: e.target.value })}
            />
          </Label>
          <Label text="추가 사실">
            <LineListField
              lines={intro.bullets}
              placeholder="수치가 하나는 들어간 한 줄"
              onChange={(lines) => patch('intro', { ...intro, bullets: lines })}
            />
          </Label>
        </div>
      </PanelCard>

      <PanelCard title="제품·서비스">
        <div className="space-y-3">
          <Label text="라인업 서술">
            <TextArea
              rows={2}
              value={products.body ?? ''}
              onChange={(e) => patch('products', { ...products, body: e.target.value })}
            />
          </Label>
          <Label text="제품별 실적">
            <div className="space-y-2">
              {products.items.map((p, i) => (
                <RowBox key={i}>
                  <Cell label="제품">
                    <Input
                      value={p.product}
                      onChange={(e) =>
                        patch('products', {
                          ...products,
                          items: products.items.map((x, idx) =>
                            idx === i ? { ...x, product: e.target.value } : x,
                          ),
                        })
                      }
                    />
                  </Cell>
                  <Cell label="실적">
                    <Input
                      value={p.achievement ?? ''}
                      placeholder="예: 누적 3,500만캔 판매"
                      onChange={(e) =>
                        patch('products', {
                          ...products,
                          items: products.items.map((x, idx) =>
                            idx === i ? { ...x, achievement: e.target.value } : x,
                          ),
                        })
                      }
                    />
                  </Cell>
                  <RowActions>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() =>
                        patch('products', {
                          ...products,
                          items: products.items.filter((_, idx) => idx !== i),
                        })
                      }
                    >
                      삭제
                    </Button>
                  </RowActions>
                </RowBox>
              ))}
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  patch('products', {
                    ...products,
                    items: [...products.items, { product: '', achievement: null }],
                  })
                }
              >
                제품 추가
              </Button>
            </div>
          </Label>
          <Label text="추가 사실">
            <LineListField
              lines={products.bullets}
              onChange={(lines) => patch('products', { ...products, bullets: lines })}
            />
          </Label>
          <Label text="단서 (주)">
            <Input
              value={products.note ?? ''}
              onChange={(e) => patch('products', { ...products, note: e.target.value })}
            />
          </Label>
        </div>
      </PanelCard>
    </>
  )
}
