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
// 근거: docs/docs_planning/3_3_5_startup_ai_fill.md §8.2·§10

import {
  CARD_SHAPE,
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

type Rec = Record<string, unknown>

export interface Envelope {
  cards: Partial<Record<CardKey, unknown>>
  notes: Partial<Record<CardKey, string[]>>
  evidence: Partial<Record<CardKey, string[]>>
}

/** 정규화 중 쌓이는 경고. 카드별 notes 뒤에 덧붙는다. */
type Warn = (card: CardKey, line: string) => void

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

// ── 카드별 정규화 ─────────────────────────────────────────────────────

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

function normIp(o: Rec, warn: Warn): Rec {
  const rights = list(o.rights)
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
  const certifications = list(o.certifications)
    .map((raw) => {
      const c = rec(raw)
      const name = str(c.name, 100)
      return name ? { name, agency: str(c.agency, 60), date: ym(c.date, 'ip', '인증 일자', warn) } : null
    })
    .filter(Boolean)
  const govProjects = list(o.govProjects)
    .map((raw) => {
      const g = rec(raw)
      const name = str(g.name, 120)
      if (!name) return null
      return {
        name,
        role: pick(g.role, GOV_ROLE_OPTIONS, 'ip', '과제 참여 형태', warn),
        period: str(g.period, 40),
        amount: num(g.amount),
      }
    })
    .filter(Boolean)
  return { rights, certifications, govProjects }
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

function normTraction(o: Rec, warn: Warn): Rec {
  const traction = list(o.traction)
    .map((raw) => {
      const e = rec(raw)
      const metric = str(e.metric, 40)
      const period = ym(e.period, 'traction', '지표 기준월', warn)
      // 지표명과 기준월이 둘 다 있어야 표의 한 줄이 된다(폼 저장 규칙과 같다).
      return metric && period ? { metric, period, unit: str(e.unit, 10), value: num(e.value) } : null
    })
    .filter(Boolean)
    .slice(0, LIMITS.traction)
  const customers = list(o.customers)
    .map((raw) => {
      const c = rec(raw)
      const name = str(c.name, 60)
      if (!name) return null
      return {
        name,
        kind: pick(c.kind, CUSTOMER_KIND_OPTIONS, 'traction', '고객 관계', warn),
        date: ym(c.date, 'traction', '고객 일자', warn),
      }
    })
    .filter(Boolean)
    .slice(0, LIMITS.customers)
  return { traction, customers }
}

function normRevenue(o: Rec): Rec {
  const revenue = list(o.revenue)
    .map((raw) => {
      const e = rec(raw)
      const y = year(e.year)
      return y ? { year: y, revenue: num(e.revenue), operatingProfit: num(e.operatingProfit), netIncome: num(e.netIncome) } : null
    })
    .filter(Boolean)
  const finance = list(o.finance)
    .map((raw) => {
      const e = rec(raw)
      const y = year(e.year)
      return y ? { year: y, assets: num(e.assets), liabilities: num(e.liabilities), equity: num(e.equity) } : null
    })
    .filter(Boolean)
  return { revenue, finance }
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

// ── 봉투 정규화 ───────────────────────────────────────────────────────

function normalizeCard(key: CardKey, raw: unknown, warn: Warn): unknown {
  switch (key) {
    case 'business': return normBusiness(rec(raw))
    case 'tech': return normTech(rec(raw), warn)
    case 'team': return normTeam(rec(raw), warn)
    case 'ip': return normIp(rec(raw), warn)
    case 'timeline': return normTimeline(raw, warn)
    case 'traction': return normTraction(rec(raw), warn)
    case 'revenue': return normRevenue(rec(raw))
    case 'employee': return normEmployee(raw)
    case 'shareholders': return normShareholders(raw, warn)
    case 'investment': return normInvestment(raw, warn)
  }
}

/**
 * 카드가 실질적으로 비었는가. 빈 카드를 null/[]로 되돌려 화면이 "기존 값 유지"로 읽게 한다.
 * 값 없는 키만 가득한 객체를 그대로 내보내면 화면은 그것을 '채워진 카드'로 세고, 담당자는
 * 무엇이 바뀌었는지 알 수 없다.
 */
function isEmptyCard(value: unknown): boolean {
  if (value == null) return true
  if (Array.isArray(value)) return value.length === 0
  return Object.values(value as Rec).every((v) =>
    v == null || v === '' || (Array.isArray(v) && v.length === 0),
  )
}

/** notes·evidence 한 카드분: 줄 수·길이 상한을 서버가 다시 강제한다. */
function normLines(v: unknown): string[] {
  return list(v)
    .map((s) => str(s, 80))
    .filter((s): s is string => Boolean(s))
    .slice(0, LIMITS.notes)
}

/**
 * 모델 응답 전체를 요청한 카드 기준으로 정규화한다. 요청하지 않은 카드가 섞여 오면 버린다
 * (담당자가 지키기로 한 카드를 모델이 채워 보낸 것을 화면까지 흘려 보내지 않는다 —
 * 체크 해제는 '안 씀'이 아니라 '건드리지 않음'이다).
 */
export function normalizeEnvelope(parsed: unknown, requested: CardKey[]): Envelope {
  const root = rec(parsed)
  const rawCards = rec(root.cards)
  const rawNotes = rec(root.notes)
  const rawEvidence = rec(root.evidence)

  const extra: Partial<Record<CardKey, string[]>> = {}
  const warn: Warn = (card, line) => {
    ;(extra[card] ??= []).push(line)
  }

  const cards: Partial<Record<CardKey, unknown>> = {}
  const notes: Partial<Record<CardKey, string[]>> = {}
  const evidence: Partial<Record<CardKey, string[]>> = {}

  for (const key of requested) {
    const value = normalizeCard(key, rawCards[key], warn)
    cards[key] = isEmptyCard(value) ? (CARD_SHAPE[key] === 'array' ? [] : null) : value
    evidence[key] = normLines(rawEvidence[key])
  }
  // 경고는 모델이 준 notes 뒤에 붙인다 — 앞에 두면 서버가 만든 줄이 모델의 관찰을 밀어낸다.
  for (const key of requested) {
    notes[key] = [...normLines(rawNotes[key]), ...(extra[key] ?? [])].slice(0, LIMITS.notes * 2)
  }
  return { cards, notes, evidence }
}

/** 모델이 코드펜스로 감싼 JSON을 돌려주는 경우까지 관대하게 파싱한다(ai-minute-draft와 같은 규약). */
export function parseJson(raw: string): unknown | null {
  const cleaned = raw.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
  try {
    return JSON.parse(cleaned)
  } catch {
    return null
  }
}
