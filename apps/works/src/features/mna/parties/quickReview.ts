/**
 * M&A 셀러 퀵 리뷰 — 절 7종의 모양과, 표에서 **계산되는 값**들.
 *
 * 저장은 `ma_sellers.quick_review` 한 칸(jsonb)이고 최상위 키 하나가 절 하나다. 그 키가 곧
 * AI 작성의 체크 단위이자 저장 단위(통째 교체)이며, 체크되지 않은 절은 그 키를 건드리지 않는다
 * (STARTUP이 '카드 하나에 컬럼 하나'로 세운 규칙과 같다).
 *
 * ## 이 파일이 지키는 규칙 하나 — 파생값은 담지 않는다
 *
 * 성장률·이익률·Net debt·요약재무는 전부 아래 표의 값에서 나온다. 저장해 두면 원본을 고쳤을 때
 * 그 칸만 옛 값으로 남고, 그때 화면은 어느 쪽이 사실인지 답하지 못한다. 그래서 원장에도 담지
 * 않고(마이그레이션 20260907230000) 모델에게 묻지도 않으며(schema.ts), 여기서 계산한다.
 *
 * ## 금액 단위는 백만원 하나다
 *
 * 문서가 '억'으로 읽히는 자리(요약재무)도 저장은 백만원이고 화면이 단위를 머리글에 한 번
 * 적는다. 절마다 단위가 갈리면 같은 칸의 숫자가 어디서 적혔는지에 따라 다른 뜻을 갖는다.
 *
 * 근거: docs/docs_planning/3_6_1_ma_seller_quick_review.md
 */

/** 절 키. Edge Function(supabase/functions/ma-seller-quick-review/cards.ts)의 목록과 한 벌이다. */
export const QUICK_REVIEW_KEYS = [
  'summary',
  'basics',
  'intro',
  'products',
  'financials',
  'valuation',
  'highlights',
] as const

export type QuickReviewKey = (typeof QUICK_REVIEW_KEYS)[number]

/**
 * 한 절에 붙는 이미지 수 상한.
 *
 * 넷인 것은 저장 용량이 아니라 **읽는 자리** 때문이다. 이미지는 카드 폭을 그대로 받아 세로로
 * 쌓이므로, 다섯 장째부터는 그 절의 문장이 스크롤 아래로 밀려 그림이 본문을 덮는다. 문서에
 * 더 많은 그림이 있다면 그것은 본문이 아니라 자료이고, 자료가 사는 자리는 자료 관리다.
 */
export const QR_IMAGE_MAX = 4

/** 이미지 한 장의 용량 상한. 자산 사진과 같은 값이다(같은 성격의 첨부라 규격을 가르지 않는다). */
export const QR_IMAGE_MAX_BYTES = 5_000_000

export interface QrShareholder {
  name: string
  /** 지분율(%). 문서가 밝히지 않았으면 null — 0으로 채우면 '지분이 없다'는 거짓이 된다. */
  ratio: number | null
}

export interface QrMetric {
  label: string
  value: string
}

export interface QrProduct {
  product: string
  achievement: string | null
}

/** 손익 한 해. 비율은 담지 않는다 — 이 값들에서 계산된다. */
export interface QrPnlYear {
  fiscalYear: number
  netRevenue: number | null
  grossProfit: number | null
  ebitda: number | null
  ebit: number | null
  adjustedEbitda: number | null
}

/** 재무상태표 한 해. Net debt는 담지 않는다 — 이자부채 − 현금이다. */
export interface QrBsYear {
  fiscalYear: number
  cash: number | null
  interestBearingDebt: number | null
  unpaidTax: number | null
  totalAssets: number | null
  totalLiabilities: number | null
  totalEquity: number | null
}

export interface QrHighlight {
  title: string
  bullets: string[]
}

export interface QuickReview {
  summary: { headline: string | null }
  basics: {
    companyName: string | null
    foundedOn: string | null
    headquarters: string | null
    representative: string | null
    businessDescription: string | null
    shareholders: QrShareholder[]
    /** 주주구성의 기준 시점. 없으면 지분율이 시점 없는 숫자가 된다. */
    shareholdersAsOf: string | null
    note: string | null
  }
  intro: { metrics: QrMetric[]; body: string | null; bullets: string[]; images: string[] }
  products: {
    body: string | null
    items: QrProduct[]
    bullets: string[]
    note: string | null
    images: string[]
  }
  financials: { pnl: QrPnlYear[]; bs: QrBsYear[]; note: string | null }
  valuation: { bullets: string[] }
  highlights: QrHighlight[]
}

type Rec = Record<string, unknown>

const rec = (v: unknown): Rec => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Rec) : {})
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
const str = (v: unknown): string | null => {
  if (v == null) return null
  const s = String(v).trim()
  return s === '' ? null : s
}
const numOrNull = (v: unknown): number | null => {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}
const strings = (v: unknown): string[] =>
  list(v)
    .map(str)
    .filter((s): s is string => s !== null)

/**
 * 절에 붙은 이미지의 오브젝트 키 목록(`ma-quick-review-images` 버킷).
 *
 * 상한을 읽는 자리에서 강제하는 것이 요점이다. 화면의 첨부 버튼도 상한에서 멈추지만, 그 길을
 * 거치지 않는 경로(AI 응답·직접 수정한 jsonb)로 여섯째가 들어오면 상한이 있다는 말이 뜻을
 * 잃는다. 원장 CHECK 제약이 아니라 여기인 것은 값이 jsonb 안쪽에 있어서다 — 절의 모양을
 * 아는 곳은 이 함수 하나다.
 */
const imagePaths = (v: unknown): string[] => strings(v).slice(0, QR_IMAGE_MAX)

/** 연도 오름차순. 두 표를 나란히 읽으므로 순서가 갈리면 같은 자리에 다른 해가 선다. */
const byYear = <T extends { fiscalYear: number }>(rows: T[]): T[] =>
  [...rows].sort((a, b) => a.fiscalYear - b.fiscalYear)

/**
 * 저장된 jsonb를 절 7종으로 읽는다. 없는 절은 빈 모양으로 세운다.
 *
 * 옛 행에는 이 칸 자체가 없다(2026-09-07 신설). 화면이 매번 `?.`로 방어하지 않도록 여기서
 * 빈 모양을 채워 돌려준다 — 방어를 화면에 흩으면 한 곳만 빠뜨려도 그 카드가 통째로 죽는다.
 */
export function readQuickReview(raw: unknown): QuickReview {
  const r = rec(raw)
  const basics = rec(r.basics)
  const intro = rec(r.intro)
  const products = rec(r.products)
  const financials = rec(r.financials)

  return {
    summary: { headline: str(rec(r.summary).headline) },
    basics: {
      companyName: str(basics.companyName),
      foundedOn: str(basics.foundedOn),
      headquarters: str(basics.headquarters),
      representative: str(basics.representative),
      businessDescription: str(basics.businessDescription),
      shareholders: list(basics.shareholders)
        .map((x) => rec(x))
        .filter((x) => str(x.name) !== null)
        .map((x) => ({ name: String(x.name).trim(), ratio: numOrNull(x.ratio) })),
      shareholdersAsOf: str(basics.shareholdersAsOf),
      note: str(basics.note),
    },
    intro: {
      metrics: list(intro.metrics)
        .map((x) => rec(x))
        .filter((x) => str(x.label) !== null && str(x.value) !== null)
        .map((x) => ({ label: String(x.label).trim(), value: String(x.value).trim() })),
      body: str(intro.body),
      bullets: strings(intro.bullets),
      images: imagePaths(intro.images),
    },
    products: {
      body: str(products.body),
      items: list(products.items)
        .map((x) => rec(x))
        .filter((x) => str(x.product) !== null)
        .map((x) => ({ product: String(x.product).trim(), achievement: str(x.achievement) })),
      bullets: strings(products.bullets),
      note: str(products.note),
      images: imagePaths(products.images),
    },
    financials: {
      pnl: byYear(
        list(financials.pnl)
          .map((x) => rec(x))
          .map((x) => ({
            fiscalYear: Number(x.fiscalYear),
            netRevenue: numOrNull(x.netRevenue),
            grossProfit: numOrNull(x.grossProfit),
            ebitda: numOrNull(x.ebitda),
            ebit: numOrNull(x.ebit),
            adjustedEbitda: numOrNull(x.adjustedEbitda),
          }))
          .filter((x) => Number.isFinite(x.fiscalYear)),
      ),
      bs: byYear(
        list(financials.bs)
          .map((x) => rec(x))
          .map((x) => ({
            fiscalYear: Number(x.fiscalYear),
            cash: numOrNull(x.cash),
            interestBearingDebt: numOrNull(x.interestBearingDebt),
            unpaidTax: numOrNull(x.unpaidTax),
            totalAssets: numOrNull(x.totalAssets),
            totalLiabilities: numOrNull(x.totalLiabilities),
            totalEquity: numOrNull(x.totalEquity),
          }))
          .filter((x) => Number.isFinite(x.fiscalYear)),
      ),
      note: str(financials.note),
    },
    valuation: { bullets: strings(rec(r.valuation).bullets) },
    highlights: list(r.highlights)
      .map((x) => rec(x))
      .filter((x) => str(x.title) !== null)
      .map((x) => ({ title: String(x.title).trim(), bullets: strings(x.bullets) })),
  }
}

// ── 계산되는 값 ────────────────────────────────────────────────────────
// 아래 넷은 어디에도 저장되지 않는다. 표가 바뀌면 함께 바뀌는 것이 이 값들의 성질이다.

/** 전년 대비 증감률(%). 앞 해가 없거나 0이면 계산할 수 없다(0으로 나눈 값은 사실이 아니다). */
export function growthPct(current: number | null, previous: number | null): number | null {
  if (current == null || previous == null || previous === 0) return null
  return ((current - previous) / Math.abs(previous)) * 100
}

/** 순매출 대비 비율(%). 순매출이 없거나 0이면 계산하지 않는다. */
export function marginPct(value: number | null, netRevenue: number | null): number | null {
  if (value == null || netRevenue == null || netRevenue === 0) return null
  return (value / netRevenue) * 100
}

/** 순차입금 = 이자부채 − 현금 및 현금성자산. 문서 자신이 적어 두는 정의다. */
export function netDebt(row: QrBsYear): number | null {
  if (row.interestBearingDebt == null || row.cash == null) return null
  return row.interestBearingDebt - row.cash
}

/**
 * '주요내용'의 요약재무 — **재무 절의 가장 최근 회계연도**다.
 *
 * 별도로 저장하지 않는 이유가 여기 있다. 같은 숫자를 두 절에 적으면 한쪽만 고쳐 어긋나고,
 * 어긋났을 때 어느 쪽이 이 기업의 사실인지 화면이 답하지 못한다.
 */
export interface QrFinancialSummary {
  fiscalYear: number
  assets: number | null
  liabilities: number | null
  equity: number | null
  revenue: number | null
  ebitda: number | null
  adjustedEbitda: number | null
}

export function financialSummary(f: QuickReview['financials']): QrFinancialSummary | null {
  const bs = f.bs.at(-1) ?? null
  const pnl = f.pnl.at(-1) ?? null
  if (!bs && !pnl) return null
  return {
    // 두 표의 마지막 해가 다를 수 있다(재무상태표만 최신인 경우). 늦은 쪽을 기준 연도로 적어
    // 두면 그 해의 손익이 없는 채로 연도만 최신이 된다 — 이른 쪽을 쓰는 것이 사실에 가깝다.
    fiscalYear: Math.min(bs?.fiscalYear ?? Infinity, pnl?.fiscalYear ?? Infinity),
    assets: bs?.totalAssets ?? null,
    liabilities: bs?.totalLiabilities ?? null,
    equity: bs?.totalEquity ?? null,
    revenue: pnl?.netRevenue ?? null,
    ebitda: pnl?.ebitda ?? null,
    adjustedEbitda: pnl?.adjustedEbitda ?? null,
  }
}

/** 이 절에 값이 하나라도 있는가 — AI 작성의 '작성됨' 배지와 조회의 빈 상태가 함께 읽는다. */
export function isSectionFilled(qr: QuickReview, key: QuickReviewKey): boolean {
  switch (key) {
    case 'summary':
      return qr.summary.headline !== null
    case 'basics': {
      const b = qr.basics
      return (
        b.shareholders.length > 0 ||
        [b.companyName, b.foundedOn, b.headquarters, b.representative, b.businessDescription].some(
          (v) => v !== null,
        )
      )
    }
    case 'intro':
      return qr.intro.metrics.length + qr.intro.bullets.length > 0 || qr.intro.body !== null
    case 'products':
      return qr.products.items.length + qr.products.bullets.length > 0 || qr.products.body !== null
    case 'financials':
      return qr.financials.pnl.length + qr.financials.bs.length > 0
    case 'valuation':
      return qr.valuation.bullets.length > 0
    case 'highlights':
      return qr.highlights.length > 0
  }
}

/** 문서 전체가 비었는가. 조회 화면이 카드를 통째로 접을지 정한다. */
export function isQuickReviewEmpty(qr: QuickReview): boolean {
  return QUICK_REVIEW_KEYS.every((k) => !isSectionFilled(qr, k))
}

/** 빈 문서. 등록 모드의 시작값이자 옛 행의 기본값이다. */
export function emptyQuickReview(): QuickReview {
  return readQuickReview(null)
}
