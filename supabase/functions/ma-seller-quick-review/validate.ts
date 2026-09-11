// [M&A 셀러 퀵 리뷰] 모델 응답 정규화 — 서버가 한 번 더 거른다.
//
// 모델 응답을 신뢰하지 않는 이유는 악의가 아니라 성질이다. 스키마는 모양만 강제하고 값의
// 옳고 그름은 말하지 않으므로, 형식이 어긋난 연도·이름 없는 행·합계가 100이 아닌 지분율이
// 모양만 맞은 채로 온다.
//
// 거르는 방식은 하나로 통일한다 — **버리되 흔적을 남긴다.** 규격 밖 값은 null로 치환하고
// 원문을 notes에 덧붙여, 담당자가 "AI가 못 채웠다"와 "AI가 채웠는데 규격에 안 맞았다"를
// 가를 수 있게 한다. 조용히 지우면 그 둘이 화면에서 같아 보인다.
//
// **값을 고쳐 맞추지 않는다.** 지분율 합계가 100이 아니어도 숫자를 비례 배분해 맞추지 않고
// 경고만 남긴다 — 맞춰 버리면 문서가 실제로 그렇게 적혀 있었는지를 아무도 되짚을 수 없다.
//
// Deno API를 쓰지 않는다(works vitest가 이 파일을 직접 돌린다).
//
// 근거: docs/docs_planning/3_6_1_ma_seller_quick_review.md

import { LIMITS, type CardKey } from './cards.ts'
import type { Warn as EngineWarn } from '../_shared/aiFill/envelope.ts'
import { checkIdentity, checkMagnitude, checkOrder, checkYearSeries } from '../_shared/aiFill/sanity.ts'

type Rec = Record<string, unknown>
type Warn = EngineWarn<CardKey>

const rec = (v: unknown): Rec => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Rec) : {})
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])

/** 문자열 한 칸: 다듬고 비면 null. 상한을 넘으면 자른다(길이는 프롬프트가 이미 지시했다). */
function str(v: unknown, max = 400): string | null {
  if (v == null) return null
  const s = String(v).trim()
  return s ? s.slice(0, max) : null
}

/**
 * 숫자 한 칸: 쉼표·통화기호·괄호 음수가 섞여 와도 숫자만 남긴다.
 *
 * 괄호를 음수로 읽는 것이 이 대상의 특징이다 — 재무 표는 손실을 `(2,924)`로 인쇄하고,
 * 모델이 그 표기를 그대로 옮기는 일이 잦다. 괄호를 모르면 손실이 이익으로 뒤집힌다.
 */
function num(v: unknown): number | null {
  if (v == null || v === '') return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const raw = String(v).trim()
  const negative = /^\(.*\)$/.test(raw)
  const cleaned = raw.replace(/[(),\s₩$￦%]/g, '')
  const n = Number(cleaned)
  if (!Number.isFinite(n)) return null
  return negative ? -Math.abs(n) : n
}

/**
 * 회계연도: 1900~2100 밖은 오독으로 본다.
 *
 * 두 자리로 온 값(25, 26)은 2000년대로 읽는다 — 문서가 `FY25A`로 인쇄하는 자리라 모델이
 * 앞 두 자리를 빠뜨리는 일이 흔하고, 버리면 표 한 줄이 통째로 사라진다.
 */
function fiscalYear(v: unknown, warn: Warn, card: CardKey): number | null {
  const n = num(v)
  if (n == null) return null
  const y = Math.round(n)
  if (y >= 0 && y <= 99) return 2000 + y
  if (y >= 1900 && y <= 2100) return y
  warn(card, `회계연도 값 "${String(v)}" — 비웠습니다`)
  return null
}

/** 비율 한 칸: 0~100 밖은 오독(지분율·점유율이 음수이거나 100을 넘을 수 없다). */
function ratio(v: unknown, warn: Warn, card: CardKey, label: string): number | null {
  const n = num(v)
  if (n == null) return null
  if (n < 0 || n > 100) {
    warn(card, `${label} 비율 "${String(v)}" — 0~100 밖이라 비웠습니다`)
    return null
  }
  return Math.round(n * 100) / 100
}

/** 문자열 목록: 빈 줄을 걷고 상한까지만. */
function lines(v: unknown, max: number, len = 200): string[] {
  return list(v)
    .map((x) => str(x, len))
    .filter((x): x is string => x !== null)
    .slice(0, max)
}

/** 이름이 비면 행 자체가 무엇인지 말하지 못한다 — 그런 행은 통째로 버린다. */
function named<T>(rows: unknown, max: number, key: string, build: (r: Rec, name: string) => T): T[] {
  const out: T[] = []
  for (const raw of list(rows)) {
    const r = rec(raw)
    const name = str(r[key], 120)
    if (!name) continue
    out.push(build(r, name))
    if (out.length >= max) break
  }
  return out
}

/**
 * 연도 표 한 벌: 연도가 없는 줄은 버리고, 연도 오름차순으로 세운다.
 *
 * 정렬을 여기서 하는 이유는 화면이 두 표를 **나란히** 읽기 때문이다 — 손익과 재무상태표의
 * 연도 순서가 다르면 같은 열에 다른 해가 서고, 그 표를 보는 사람은 그것을 알아채지 못한다.
 */
function yearRows(rows: unknown, card: CardKey, warn: Warn, fields: string[]): Rec[] {
  const out: Rec[] = []
  for (const raw of list(rows)) {
    const r = rec(raw)
    const y = fiscalYear(r.fiscalYear, warn, card)
    if (y == null) continue
    const row: Rec = { fiscalYear: y }
    for (const f of fields) row[f] = num(r[f])
    out.push(row)
    if (out.length >= LIMITS.fiscalYears) break
  }
  return out.sort((a, b) => Number(a.fiscalYear) - Number(b.fiscalYear))
}

const PNL_FIELDS = ['netRevenue', 'grossProfit', 'ebitda', 'ebit', 'adjustedEbitda']
const BS_FIELDS = [
  'cash',
  'interestBearingDebt',
  'unpaidTax',
  'totalAssets',
  'totalLiabilities',
  'totalEquity',
]

/**
 * 두 표의 숫자가 서로 말이 되는지 본다. 판정 자체는 엔진이 갖는다(_shared/aiFill/sanity.ts) —
 * *어떤 칸이 자산이고 매출인가*만 이 대상이 답한다.
 *
 * **어긋나도 고치지 않는다.** 셋 중 무엇이 잘못 읽혔는지 알 수 없고, 하나를 계산해 끼우면
 * 문서에 그렇게 적혀 있었다고 말하는 것이 된다. 그래서 경고만 남기고 값은 그대로 둔다 —
 * 이 경고가 바로 담당자가 원문을 열어 볼 신호다.
 */
function checkFinancials(pnl: Rec[], bs: Rec[], warn: Warn): void {
  // 반올림 잔차를 오류로 세지 않도록 1(백만원) 여유를 둔다.
  checkIdentity(bs, 'fiscalYear', 'totalAssets', ['totalLiabilities', 'totalEquity'], 1, warn, 'financials', '자산총계 ≠ 부채+자본')

  checkYearSeries(pnl, 'fiscalYear', warn, 'financials', '손익 표')
  checkYearSeries(bs, 'fiscalYear', warn, 'financials', '재무상태표')

  // 단위가 섞이는 자리는 **표의 기둥 칸**이다. 딸린 칸까지 전부 보면 경고가 표를 덮는다.
  checkMagnitude(pnl, 'fiscalYear', [{ key: 'netRevenue', label: '순매출' }], warn, 'financials')
  checkMagnitude(bs, 'fiscalYear', [{ key: 'totalAssets', label: '자산총계' }], warn, 'financials')

  // 정의상 일어날 수 없는 관계만. 매출총이익은 순매출에서 원가를 뺀 값이고,
  // EBITDA는 그 아래 단이라 둘 다 순매출을 넘을 수 없다.
  checkOrder(
    pnl,
    'fiscalYear',
    [
      { larger: 'netRevenue', smaller: 'grossProfit', message: '매출총이익이 순매출보다 큽니다' },
      { larger: 'netRevenue', smaller: 'ebitda', message: 'EBITDA가 순매출보다 큽니다' },
    ],
    warn,
    'financials',
  )
}

/** 절 한 장의 값을 규격에 맞춘다. */
export function normalizeCard(key: CardKey, raw: unknown, warn: Warn): unknown {
  const r = rec(raw)

  switch (key) {
    case 'summary':
      return { headline: str(r.headline, 200) }

    case 'basics': {
      const shareholders = named(r.shareholders, 20, 'name', (row, name) => ({
        name,
        ratio: ratio(row.ratio, warn, 'basics', name),
      }))
      // 합계가 100에서 멀면 빠진 주주가 있다는 뜻이다. 값은 그대로 두고 사실만 알린다 —
      // 비례 배분해 맞추면 문서에 없던 숫자가 문서의 값처럼 앉는다.
      const sum = shareholders.reduce((acc, s) => acc + (s.ratio ?? 0), 0)
      if (shareholders.length > 0 && Math.abs(sum - 100) > 1) {
        warn('basics', `주주 지분율 합계 ${sum.toFixed(1)}% — 누락된 주주가 있는지 확인하세요`)
      }
      return {
        companyName: str(r.companyName, 120),
        foundedOn: str(r.foundedOn, 40),
        headquarters: str(r.headquarters, 160),
        representative: str(r.representative, 60),
        businessDescription: str(r.businessDescription, 300),
        shareholders,
        shareholdersAsOf: str(r.shareholdersAsOf, 80),
        note: str(r.note, 300),
      }
    }

    case 'intro':
      return {
        // 라벨과 값이 짝이라 라벨이 없는 타일은 무엇의 숫자인지 말하지 못한다.
        metrics: named(r.metrics, LIMITS.metrics, 'label', (row, label) => ({
          label,
          value: str(row.value, 40) ?? '',
        })).filter((m) => m.value !== ''),
        body: str(r.body, 600),
        bullets: lines(r.bullets, LIMITS.introBullets, 200),
      }

    case 'products':
      return {
        body: str(r.body, 400),
        items: named(r.items, LIMITS.products, 'product', (row, product) => ({
          product,
          achievement: str(row.achievement, 160),
        })),
        bullets: lines(r.bullets, LIMITS.productBullets, 200),
        note: str(r.note, 300),
      }

    case 'financials': {
      const bs = yearRows(r.bs, 'financials', warn, BS_FIELDS)
      const pnl = yearRows(r.pnl, 'financials', warn, PNL_FIELDS)
      checkFinancials(pnl, bs, warn)
      return {
        pnl,
        bs,
        note: str(r.note, 400),
      }
    }

    case 'valuation':
      return { bullets: lines(r.bullets, LIMITS.valuationBullets, 220) }

    case 'highlights':
      // 유일한 목록 절. 제목이 없는 묶음은 무엇을 묶은 것인지 말하지 못해 버린다.
      return named(raw, LIMITS.highlights, 'title', (row, title) => ({
        title: title.slice(0, 40),
        bullets: lines(row.bullets, LIMITS.highlightBullets, 220),
      })).filter((h) => h.bullets.length > 0)
  }
}
