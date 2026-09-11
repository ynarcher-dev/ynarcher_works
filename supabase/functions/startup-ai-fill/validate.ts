// [AI 작성하기] 모델 응답 정규화 — 서버가 한 번 더 거른다.
//
// 모델 응답을 신뢰하지 않는 이유는 악의가 아니라 성질이다. 스키마는 모양만 강제하고 값의
// 옳고 그름은 말하지 않으므로, 고정 선택지 밖의 값·형식이 어긋난 날짜·이름 없는 행이 모양만
// 맞은 채로 온다. 그것을 그대로 폼에 넣으면 화면의 셀렉트가 빈 채로 서거나(값이 목록에 없다)
// 저장 단계에서 조용히 떨어진다.
//
// 거르는 방식은 하나로 통일한다 — **버리되 흔적을 남긴다.** 규격 밖 값은 null로 치환하고
// 원문을 notes에 덧붙여, 담당자가 "AI가 못 채웠다"와 "AI가 채웠는데 규격에 안 맞았다"를
// 가를 수 있게 한다. 조용히 지우면 그 둘이 화면에서 같아 보인다.
//
// Deno API를 쓰지 않는다(works vitest가 이 파일을 직접 돌린다).
// **봉투는 여기 없다**(2026-09-06) — 엔진이 소유한다. 이 파일에 남는 것은 기업 정보라는
// 대상에만 있는 규격뿐이라, 다른 대상이 이 기능을 쓸 때 다시 쓰지 않는 유일한 부분이다.
//
// 근거: docs/docs_planning/3_3_5_startup_ai_fill.md §8.2·§10·§16.16

import {
  COMPANY_FORM_OPTIONS,
  CUSTOMER_KIND_OPTIONS,
  DEV_INSOURCING_OPTIONS,
  DEV_STAGE_OPTIONS,
  EMPLOYMENT_OPTIONS,
  GOV_ROLE_OPTIONS,
  IP_KIND_OPTIONS,
  IP_STATUS_OPTIONS,
  LIMITS,
  type CardKey,
} from './cards.ts'
import type { Warn as EngineWarn } from '../_shared/aiFill/envelope.ts'
import {
  checkIdentity,
  checkMagnitude,
  checkOrder,
  checkYearSeries,
  type YearRow,
} from '../_shared/aiFill/sanity.ts'

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

/** 숫자 한 칸: 쉼표·통화기호가 섞여 와도 숫자만 남긴다. 숫자가 아니면 null. */
function num(v: unknown): number | null {
  if (v == null || v === '') return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const cleaned = String(v).replace(/[,\s₩$￦]/g, '')
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

function int(v: unknown): number | null {
  const n = num(v)
  return n == null ? null : Math.round(n)
}

/** 고정 선택지: 목록 밖이면 null + 원문을 경고로 남긴다(조용히 지우지 않는다). */
function pick(v: unknown, options: readonly string[], card: CardKey, label: string, warn: Warn): string | null {
  const s = str(v, 60)
  if (!s) return null
  if (options.includes(s)) return s
  warn(card, `${label} 규격 밖 값 "${s}" — 비웠습니다`)
  return null
}

/** YYYY-MM 또는 YYYY-MM-DD만 통과. 연도만 온 값은 월을 지어낼 수 없어 버린다. */
function ym(v: unknown, card: CardKey, label: string, warn: Warn): string | null {
  const s = str(v, 10)
  if (!s) return null
  if (/^\d{4}-\d{2}(-\d{2})?$/.test(s)) return s
  warn(card, `${label} 날짜 형식 아님 "${s}" — 비웠습니다`)
  return null
}

/** 연도: 1900~2100 밖은 오독으로 본다(단위 행·페이지 번호가 연도 칸에 들어오는 사고). */
function year(v: unknown): number | null {
  const n = int(v)
  return n != null && n >= 1900 && n <= 2100 ? n : null
}

/** 일 단위까지 있는 날짜만. 설립일은 date 컬럼이라 월까지만 아는 값을 넣을 자리가 없다. */
function ymd(v: unknown, card: CardKey, label: string, warn: Warn): string | null {
  const s = str(v, 10)
  if (!s) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  warn(card, `${label} 날짜 형식 아님 "${s}" — 비웠습니다`)
  return null
}

// ── 카드별 정규화 ─────────────────────────────────────────────────────

/**
 * 기본 정보: 서류에 인쇄된 값이라 형식 검사가 곧 진위 검사에 가깝다.
 *
 * 소재지는 ADMIN 원장(location_tags)의 값하고만 맞는다. 목록을 못 받았을 때 그냥 통과시키면
 * 화면의 셀렉트에 없는 값이 폼에 앉아 저장 직전까지 아무도 모른다.
 */
function normBasics(o: Rec, warn: Warn, locations: string[]): Rec {
  let location: string | null = null
  const rawLocation = str(o.location, 40)
  if (rawLocation) {
    if (locations.length === 0) warn('basics', `소재지 목록을 불러오지 못해 "${rawLocation}"를 비웠습니다`)
    else location = pick(rawLocation, locations, 'basics', '소재지', warn)
  }
  return {
    name: str(o.name, 100),
    representative: str(o.representative, 60),
    companyForm: pick(o.companyForm, COMPANY_FORM_OPTIONS, 'basics', '회사 형태', warn),
    foundedOn: ymd(o.foundedOn, 'basics', '설립일', warn),
    bizRegNo: bizRegNo(o.bizRegNo, warn),
    location,
    addressDetail: str(o.addressDetail, 200),
  }
}

/** 사업자등록번호: 숫자 10자리만 통과. 13자리(법인등록번호)를 잘못 읽어 오는 사고가 흔하다. */
function bizRegNo(v: unknown, warn: Warn): string | null {
  const s = str(v, 20)
  if (!s) return null
  const digits = s.replace(/\D/g, '')
  if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`
  warn('basics', `사업자등록번호 자릿수 아님 "${s}" — 비웠습니다`)
  return null
}

/**
 * 요약: 이 카드만 서술어를 허용하므로 길이 상한도 문장 기준이다.
 *
 * 축마다 줄 수를 서버가 다시 자르는 이유는 화면 입력 칸이 축마다 셋이기 때문이다 — 넷째 줄이
 * 오면 그 줄은 폼에 자리가 없어 조용히 사라진다.
 */
function normSummary(o: Rec): Rec {
  const axis = (v: unknown) =>
    list(v)
      .map((s) => str(s, 120))
      .filter((s): s is string => Boolean(s))
      .slice(0, LIMITS.summaryLines)
  return { strengths: axis(o.strengths), improvements: axis(o.improvements), needs: axis(o.needs) }
}

function normBusiness(o: Rec): Rec {
  return {
    oneLiner: str(o.oneLiner, 60),
    businessModel: str(o.businessModel, 200),
    targetMarket: str(o.targetMarket, 120),
    revenueModel: str(o.revenueModel, 200),
    salesChannel: str(o.salesChannel, 120),
    supplyMode: str(o.supplyMode, 100),
  }
}

function normTech(o: Rec, warn: Warn): Rec {
  return {
    product: str(o.product, 200),
    devStage: pick(o.devStage, DEV_STAGE_OPTIONS, 'tech', '개발 단계', warn),
    coreTech: str(o.coreTech, 200),
    devInsourcing: pick(o.devInsourcing, DEV_INSOURCING_OPTIONS, 'tech', '개발 내재화', warn),
    differentiator: str(o.differentiator, 200),
  }
}

function normTeam(o: Rec, warn: Warn): Rec {
  const members = list(o.members)
    .map((raw) => {
      const m = rec(raw)
      const name = str(m.name, 40)
      if (!name) return null
      return {
        name,
        role: str(m.role, 40),
        background: str(m.background, 100),
        employment: pick(m.employment, EMPLOYMENT_OPTIONS, 'team', '재직 형태', warn),
        joinedAt: ym(m.joinedAt, 'team', '합류 시점', warn),
        // null(언급 없음)을 false로 눕히지 않는다 — 화면이 '확인 필요'로 읽어야 한다.
        hasEquity: typeof m.hasEquity === 'boolean' ? m.hasEquity : null,
      }
    })
    .filter(Boolean)
    .slice(0, LIMITS.members)
  const advisors = list(o.advisors)
    .map((raw) => {
      const a = rec(raw)
      const name = str(a.name, 40)
      return name ? { name, affiliation: str(a.affiliation, 60), role: str(a.role, 40) } : null
    })
    .filter(Boolean)
    .slice(0, LIMITS.advisors)
  const capabilities = list(o.capabilities)
    .map((c) => str(c, 40))
    .filter(Boolean)
    .slice(0, LIMITS.capabilities)
  // 폼의 지분 보유 칸은 boolean이라 null을 담을 자리가 없고 false(=없음)로 눕는다. 그래서
  // "언급이 없었다"는 사실을 여기서 말해 두지 않으면, 확인하지 못한 것이 확인해서 없는 것으로
  // 화면에 굳는다. 칸을 바꾸는 것은 폼 전체 회귀가 걸린 일이라 1차는 이 줄이 대신 답한다.
  const unknownEquity = (members as { name: string; hasEquity: boolean | null }[]).filter(
    (m) => m.hasEquity == null,
  )
  if (unknownEquity.length > 0) {
    warn('team', `지분 보유 미확인: ${unknownEquity.map((m) => m.name).join(' · ')}`)
  }
  return {
    founderStrength: str(o.founderStrength, 200),
    orgComposition: str(o.orgComposition, 120),
    hiringPlan: str(o.hiringPlan, 120),
    members,
    advisors,
    capabilities,
  }
}

/**
 * 지식재산권: 명칭도 번호도 없는 행은 버린다 — 종류만 남은 행은 "특허 5건"을 다섯 줄로 편 것이다.
 *
 * 2026-09-09에 카드가 갈리며 목록이 곧 카드가 됐다(구 `ip.rights`). 판정은 그대로 옮겼다.
 */
function normIp(v: unknown, warn: Warn): unknown[] {
  return list(v)
    .map((raw) => {
      const r = rec(raw)
      const title = str(r.title, 120)
      const no = str(r.no, 40)
      if (!title && !no) return null
      return {
        kind: pick(r.kind, IP_KIND_OPTIONS, 'ip', '권리 종류', warn),
        title: title ?? '',
        no,
        status: pick(r.status, IP_STATUS_OPTIONS, 'ip', '권리 상태', warn),
        date: ym(r.date, 'ip', '권리 일자', warn),
      }
    })
    .filter(Boolean)
}

/** 인증·정부과제: 화면에서 한 카드에 함께 서므로 갈린 뒤에도 목록 둘을 든 객체다(구 `ip`의 나머지). */
function normCert(o: Rec, warn: Warn): Rec {
  const certifications = list(o.certifications)
    .map((raw) => {
      const c = rec(raw)
      const name = str(c.name, 100)
      return name ? { name, agency: str(c.agency, 60), date: ym(c.date, 'cert', '인증 일자', warn) } : null
    })
    .filter(Boolean)
  const govProjects = list(o.govProjects)
    .map((raw) => {
      const g = rec(raw)
      const name = str(g.name, 120)
      if (!name) return null
      return {
        name,
        role: pick(g.role, GOV_ROLE_OPTIONS, 'cert', '과제 참여 형태', warn),
        period: str(g.period, 40),
        amount: num(g.amount),
      }
    })
    .filter(Boolean)
  return { certifications, govProjects }
}

function normTimeline(v: unknown, warn: Warn): unknown[] {
  return list(v)
    .map((raw) => {
      const e = rec(raw)
      const date = ym(e.date, 'timeline', '연혁 일자', warn)
      const content = str(e.content, 80)
      return date && content ? { date, content } : null
    })
    .filter(Boolean)
    .slice(0, LIMITS.timeline)
}

function normTraction(v: unknown, warn: Warn): unknown[] {
  return list(v)
    .map((raw) => {
      const e = rec(raw)
      const metric = str(e.metric, 40)
      const period = ym(e.period, 'traction', '지표 기준월', warn)
      // 지표명과 기준월이 둘 다 있어야 표의 한 줄이 된다(폼 저장 규칙과 같다).
      return metric && period ? { metric, period, unit: str(e.unit, 10), value: num(e.value) } : null
    })
    .filter(Boolean)
    .slice(0, LIMITS.traction)
}

function normCustomers(v: unknown, warn: Warn): unknown[] {
  return list(v)
    .map((raw) => {
      const c = rec(raw)
      const name = str(c.name, 60)
      if (!name) return null
      return {
        name,
        kind: pick(c.kind, CUSTOMER_KIND_OPTIONS, 'customers', '고객 관계', warn),
        date: ym(c.date, 'customers', '고객 일자', warn),
      }
    })
    .filter(Boolean)
    .slice(0, LIMITS.customers)
}

function normRevenue(v: unknown, warn: Warn): unknown[] {
  const rows = list(v)
    .map((raw) => {
      const e = rec(raw)
      const y = year(e.year)
      return y ? { year: y, revenue: num(e.revenue), operatingProfit: num(e.operatingProfit), netIncome: num(e.netIncome) } : null
    })
    .filter(Boolean) as YearRow[]

  // 규격에는 맞지만 서로 모순되는 값을 본다(_shared/aiFill/sanity.ts). **고치지 않고 알린다** —
  // 어느 값이 잘못 읽혔는지 알 수 없고, 계산해 끼우면 문서에 그렇게 적혀 있었다고 말하는 것이 된다.
  checkYearSeries(rows, 'year', warn, 'revenue', '매출 표')
  checkMagnitude(rows, 'year', [{ key: 'revenue', label: '매출' }], warn, 'revenue')
  // 영업이익은 매출에서 원가와 판관비를 뺀 값이라 정의상 매출을 넘을 수 없다.
  checkOrder(
    rows,
    'year',
    [{ larger: 'revenue', smaller: 'operatingProfit', message: '영업이익이 매출보다 큽니다' }],
    warn,
    'revenue',
  )
  return rows
}

function normFinance(v: unknown, warn: Warn): unknown[] {
  const rows = list(v)
    .map((raw) => {
      const e = rec(raw)
      const y = year(e.year)
      return y ? { year: y, assets: num(e.assets), liabilities: num(e.liabilities), equity: num(e.equity) } : null
    })
    .filter(Boolean) as YearRow[]

  // 자산 = 부채 + 자본. 이 원장은 금액을 **원 단위**로 담으므로 반올림 잔차가 없고, 여유는
  // 백만원 미만의 표기 차이만 흡수할 만큼만 둔다(그보다 큰 차이는 옮겨 적기 사고다).
  checkIdentity(rows, 'year', 'assets', ['liabilities', 'equity'], 1_000_000, warn, 'finance', '자산 ≠ 부채+자본')
  checkYearSeries(rows, 'year', warn, 'finance', '재무 표')
  checkMagnitude(rows, 'year', [{ key: 'assets', label: '자산' }], warn, 'finance')
  return rows
}

function normEmployee(v: unknown): unknown[] {
  return list(v)
    .map((raw) => {
      const e = rec(raw)
      const y = year(e.year)
      return y ? { year: y, employeeCount: int(e.employeeCount) } : null
    })
    .filter(Boolean)
}

function normShareholders(v: unknown, warn: Warn): unknown[] {
  return list(v)
    .map((raw) => {
      const s = rec(raw)
      const holders = list(s.holders)
        .map((h) => {
          const x = rec(h)
          const name = str(x.name, 60)
          return name ? { name, shares: num(x.shares), percentage: num(x.percentage) } : null
        })
        .filter(Boolean) as { name: string; percentage: number | null }[]
      if (holders.length === 0) return null
      // 기준일은 "월만 아는" 경우를 빈 문자열로 받는다(폼의 하위 호환 규약과 같다).
      const raw2 = str(s.date, 10)
      const date = raw2 && /^\d{4}-\d{2}-\d{2}$/.test(raw2) ? raw2 : ''
      const sum = holders.reduce((acc, h) => acc + (h.percentage ?? 0), 0)
      // 합을 맞추려 값을 고치지 않는다 — 어긋났다는 사실 자체가 확인해야 할 정보다.
      if (sum > 0 && (sum < 99 || sum > 101)) {
        warn('shareholders', `지분율 합계 ${sum.toFixed(1)}%${date ? ` (${date})` : ''} — 확인 필요`)
      }
      return { date, holders }
    })
    .filter(Boolean)
}

function normInvestment(v: unknown, warn: Warn): unknown[] {
  return list(v)
    .map((raw) => {
      const e = rec(raw)
      const date = ym(e.date, 'investment', '투자 시점', warn)
      if (!date) return null
      return {
        date,
        round: str(e.round, 30),
        valuation: num(e.valuation),
        fundingAmount: num(e.fundingAmount),
        investor: str(e.investor, 200),
      }
    })
    .filter(Boolean)
    .slice(0, LIMITS.investment)
}

// ── 카드 한 장 ────────────────────────────────────────────────────────

/**
 * 카드 한 장의 값을 규격에 맞춘다 — **프로파일이 소유하는 유일한 정규화**다.
 *
 * 봉투(요청하지 않은 카드 버리기·빈 카드 되돌리기·notes 다듬기·근거 대조)는 대상이 무엇이든
 * 같은 일이라 엔진이 한다(`_shared/aiFill/envelope.ts`). 여기 남는 것은 기업 정보라는 이
 * 대상에만 있는 규격뿐이다.
 */
export function normalizeCard(key: CardKey, raw: unknown, warn: Warn, locations: string[] = []): unknown {
  switch (key) {
    case 'basics': return normBasics(rec(raw), warn, locations)
    case 'summary': return normSummary(rec(raw))
    case 'business': return normBusiness(rec(raw))
    case 'tech': return normTech(rec(raw), warn)
    case 'team': return normTeam(rec(raw), warn)
    case 'ip': return normIp(raw, warn)
    case 'cert': return normCert(rec(raw), warn)
    case 'timeline': return normTimeline(raw, warn)
    case 'traction': return normTraction(raw, warn)
    case 'customers': return normCustomers(raw, warn)
    case 'revenue': return normRevenue(raw, warn)
    case 'finance': return normFinance(raw, warn)
    case 'employee': return normEmployee(raw)
    case 'shareholders': return normShareholders(raw, warn)
    case 'investment': return normInvestment(raw, warn)
  }
}
