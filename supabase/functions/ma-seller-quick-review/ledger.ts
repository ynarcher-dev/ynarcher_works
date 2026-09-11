// [M&A 셀러 퀵 리뷰] 연결한 스타트업의 **이미 확인된 사실**을 읽어 온다.
//
// ## 왜 자료를 다시 읽지 않고 값을 받는가
//
// 셀러가 스타트업 원장의 한 행을 가리키면(`ma_sellers.startup_id`) 그 기업의 매출·주주·대표자는
// **이미 담당자가 자료를 보고 확정해 저장한 값**이다. 그런데 종전의 퀵 리뷰는 그 값을 쓰지 않고
// 값의 출처인 PDF를 참조 자료로 끌어와 **처음부터 다시 읽어** 같은 값을 다시 뽑았다. 비용은
// 자료 쪽수만큼 들고, 결과는 사람이 확인한 값과 어긋날 수 있었다 — 같은 기업이 두 화면에서
// 다른 매출로 서는 일이 실제로 생길 수 있는 구조다.
//
// 그래서 **확정된 것은 사실로 넘기고 모델은 새 자료에서 더해지는 것만 찾게 한다.**
//
// ## 어긋나면 자료가 이긴다
//
// 원장 값이 언제나 옳은 것은 아니다 — 새로 올라온 감사보고서가 그 값을 갱신할 수 있다. 그래서
// 프롬프트는 **자료를 우선하되 차이를 notes에 남기라**고 지시한다(prompts.ts). 모델이 조용히
// 한쪽을 고르면 어느 쪽이 맞는지 아무도 모르게 되고, 그것이 이 기능에서 가장 나쁜 결과다.
//
// ## 연결을 여기서 찾는 이유
//
// **자료의 참조 방향은 SQL 함수 하나가 소유하지만**(`app.attachment_ref_sources` — 첨부 행에
// 방향을 적지 않는 이유와 같다), 여기서 묻는 것은 자료가 아니라 **이 셀러가 어느 기업인가**이고
// 그 답은 `ma_sellers.startup_id` 컬럼 자체다. 다만 저장 전/후를 가르는 규칙은 그 함수와
// 똑같이 맞춘다 — 폼이 방금 고른 연결이 있으면 그것이 답이고, 없으면 저장된 행에서 찾는다
// (그쪽의 `coalesce(p_link_id, (select startup_id ...))`와 같은 순서다).
//
// ## 권한은 한 뼘도 넓히지 않는다
//
// 조회는 전부 **호출자 토큰**으로 돈다. `public.startups`의 SELECT 정책이 그대로 걸리므로 그
// 기업을 볼 수 없는 사람에게는 빈 값이 오고, 프롬프트에 확정 사실 칸이 서지 않는다. 참조 자료
// 목록이 같은 규약으로 도는 것과 같다(refs.ts).
//
// Deno API를 쓰지 않는다(works vitest가 이 조립을 직접 돌린다).
// 근거: docs/docs_planning/3_6_1_ma_seller_quick_review.md §6

import type { CallerClient } from '../_shared/aiFill/profile.ts'

/** 확정 사실 한 벌. 모든 칸이 비어 있을 수 있다 — 그것도 이 기업의 사실이다. */
export interface LedgerFacts {
  name: string
  representative: string
  foundedOn: string
  location: string
  companyForm: string
  /** 한 줄 소개·사업모델처럼 문장으로 저장된 값들(라벨 → 값). */
  descriptions: Array<{ label: string; value: string }>
  /** 연도별 손익. 금액은 **백만원**으로 환산된 값이다(아래 toMillion 주석). */
  revenue: Array<{ year: number; revenue: number | null; operatingProfit: number | null; netIncome: number | null }>
  /** 연도별 재무상태. 금액 단위는 손익과 같다. */
  finance: Array<{ year: number; assets: number | null; liabilities: number | null; equity: number | null }>
  /** 가장 최근 시점의 주주 구성. */
  shareholders: { asOf: string; holders: Array<{ name: string; ratio: number | null }> }
}

/**
 * 원 단위 금액을 **백만원**으로 옮긴다.
 *
 * **이 함수가 이 파일에서 가장 위험한 자리다.** STARTUP 원장은 금액을 원 단위로 저장하고
 * (`startup-ai-fill/prompts.ts` — "1억 = 100000000"), 퀵 리뷰의 표는 백만원 단위다
 * ("1억 = 100"). 환산하지 않고 넘기면 모델이 그 숫자를 그대로 백만원 칸에 옮겨 **모든 금액이
 * 백만 배로 선다.** 프롬프트로 "환산하라"고 지시하지 않고 코드가 옮기는 이유가 이것이다 —
 * 단위 환산은 모델이 가끔 틀리는 일이고, 틀려도 그럴듯해 보인다.
 *
 * 반올림한다 — 백만원 미만은 이 문서가 견주는 자릿수가 아니다.
 */
function toMillion(v: unknown): number | null {
  const n = num(v)
  return n === null ? null : Math.round(n / 1_000_000)
}

/**
 * 수를 읽는다. **비어 있는 것은 0이 아니다.**
 *
 * `Number(null)`과 `Number('')`이 둘 다 0이라, 값을 그대로 `Number()`에 넣으면 **모르는 칸이
 * 0으로 채워진다** — 당기순이익을 적지 않은 해가 "순이익 0"으로 서고, 그 줄은 빈 칸보다 나쁘다
 * (없는 사실을 말하고, 읽는 사람은 그것이 확정 값인 줄 안다). AI가 값을 지우지 못한다는 관통
 * 규칙과 같은 자리이며, 방향만 반대다 — 여기서는 우리가 없는 값을 만들지 않는다.
 */
function num(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v !== 'string') return null
  const t = v.trim()
  if (t === '') return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

function text(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

function ratio(v: unknown): number | null {
  return num(v)
}

function year(v: unknown): number | null {
  const n = num(v)
  return n !== null && Number.isInteger(n) && n > 1900 && n < 2200 ? n : null
}

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : []
}

function obj(v: unknown): Record<string, unknown> {
  return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {}
}

/**
 * 문장으로 저장된 칸들. **라벨을 여기서 짓는 것**은 원장 컬럼명이 프롬프트에 그대로 서면
 * 모델이 그것을 값의 일부로 읽기 때문이다(`oneLiner:` 대신 `한줄 소개:`).
 *
 * 담는 것은 퀵 리뷰의 절이 실제로 묻는 것뿐이다 — 기술 스택·채용 계획처럼 이 문서에 설 자리가
 * 없는 값은 넣지 않는다. 프롬프트에 실리는 모든 줄은 토큰이고, 쓰이지 않는 줄은 비용일 뿐
 * 아니라 모델이 고를 수 있는 값을 늘려 절의 경계를 흐린다.
 */
const DESCRIPTION_FIELDS: ReadonlyArray<{ column: 'business_profile' | 'tech_profile'; key: string; label: string }> = [
  { column: 'business_profile', key: 'oneLiner', label: '한 줄 소개' },
  { column: 'business_profile', key: 'businessModel', label: '사업모델' },
  { column: 'business_profile', key: 'targetMarket', label: '목표 시장' },
  { column: 'business_profile', key: 'revenueModel', label: '수익모델' },
  { column: 'business_profile', key: 'salesChannel', label: '판매채널' },
  { column: 'tech_profile', key: 'product', label: '제품·서비스' },
  { column: 'tech_profile', key: 'coreTech', label: '핵심 기술' },
  { column: 'tech_profile', key: 'differentiator', label: '차별 역량' },
]

/** 원장 행 하나를 확정 사실로 세운다. 행을 읽는 일과 가르는 이유는 이 조립만 시험할 수 있게 하기 위해서다. */
export function toLedgerFacts(row: Record<string, unknown>): LedgerFacts {
  const growth = obj(row.growth_metrics)
  const descriptions: LedgerFacts['descriptions'] = []
  for (const f of DESCRIPTION_FIELDS) {
    const value = text(obj(row[f.column])[f.key])
    if (value) descriptions.push({ label: f.label, value })
  }

  // 연도가 없는 줄은 버린다 — 표의 축이 없는 값은 어느 해의 것인지 말하지 못한다.
  const revenue = asArray(growth.revenue)
    .map((e) => {
      const r = obj(e)
      const y = year(r.year)
      return y === null
        ? null
        : {
            year: y,
            revenue: toMillion(r.revenue),
            operatingProfit: toMillion(r.operatingProfit),
            netIncome: toMillion(r.netIncome),
          }
    })
    .filter((e): e is LedgerFacts['revenue'][number] => e !== null)
    .sort((a, b) => a.year - b.year)

  const finance = asArray(growth.finance)
    .map((e) => {
      const r = obj(e)
      const y = year(r.year)
      return y === null
        ? null
        : {
            year: y,
            assets: toMillion(r.assets),
            liabilities: toMillion(r.liabilities),
            equity: toMillion(r.equity),
          }
    })
    .filter((e): e is LedgerFacts['finance'][number] => e !== null)
    .sort((a, b) => a.year - b.year)

  // 주주는 시점별 스냅샷 목록이다. **가장 최근 한 시점만** 넘긴다 — 퀵 리뷰의 주주 표는 한
  // 시점을 세우는 자리이고, 여러 시점을 함께 주면 모델이 그것을 섞어 합계가 100을 넘는다.
  const snapshots = asArray(row.shareholders)
    .map((s) => obj(s))
    .filter((s) => Array.isArray(s.holders))
    .sort((a, b) => text(a.date).localeCompare(text(b.date)))
  const latest = snapshots[snapshots.length - 1]
  const shareholders = {
    asOf: latest ? text(latest.date) : '',
    holders: asArray(latest?.holders)
      .map((h) => {
        const r = obj(h)
        return { name: text(r.name), ratio: ratio(r.ratio) }
      })
      .filter((h) => h.name !== '')
      .sort((a, b) => (b.ratio ?? 0) - (a.ratio ?? 0)),
  }

  return {
    name: text(row.name),
    representative: text(row.representative),
    foundedOn: text(row.founded_on),
    location: text(row.location),
    companyForm: text(row.company_form),
    descriptions,
    revenue,
    finance,
    shareholders,
  }
}

/** 확정 사실이 하나라도 있는가. 전부 비면 프롬프트에 칸을 세우지 않는다(빈 표제는 지시가 아니다). */
export function hasFacts(f: LedgerFacts): boolean {
  return Boolean(
    f.name ||
      f.representative ||
      f.foundedOn ||
      f.location ||
      f.descriptions.length > 0 ||
      f.revenue.length > 0 ||
      f.finance.length > 0 ||
      f.shareholders.holders.length > 0,
  )
}

/**
 * 이 셀러가 가리키는 스타트업의 확정 값을 읽는다. 연결이 없거나 볼 수 없으면 null.
 *
 * **실패를 삼킨다.** 확정 사실은 보태는 것이라, 그 조회가 실패했다고 자료로 초안을 만드는 일까지
 * 막을 이유가 없다(참조 자료가 같은 판단을 한다 — refs.ts).
 */
export async function loadLedgerFacts(
  caller: CallerClient,
  target: { targetId: string | null; linkId: string | null },
): Promise<LedgerFacts | null> {
  // 폼이 방금 고른 연결이 있으면 그것이 답이다(등록 화면에는 저장된 행이 없다).
  let startupId = target.linkId
  if (!startupId && target.targetId) {
    const { data } = await caller
      .from('ma_sellers')
      .select('startup_id, deleted_at')
      .eq('id', target.targetId)
      .maybeSingle()
    // 지워진 행의 연결은 따라가지 않는다. **정책이 아니라 우리가 거른다** — 소프트 삭제는
    // 이 앱의 규칙이고 SELECT 정책이 그것까지 판정하지는 않는다(참조 방향 함수도 같은 조건을
    // SQL에 직접 적는다).
    const id = data && data.deleted_at == null ? data.startup_id : null
    startupId = typeof id === 'string' && id ? id : null
  }
  if (!startupId) return null

  const { data: row, error } = await caller
    .from('startups')
    .select(
      'name, representative, founded_on, location, company_form, business_profile, tech_profile, growth_metrics, shareholders, deleted_at',
    )
    .eq('id', startupId)
    .maybeSingle()
  if (error || !row || row.deleted_at != null) return null

  const facts = toLedgerFacts(row)
  return hasFacts(facts) ? facts : null
}
