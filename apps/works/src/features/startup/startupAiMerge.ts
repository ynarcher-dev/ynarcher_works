import type { EntityRow } from '@/features/master/entityHooks'
import { AI_CARD_LABEL, type AiCardKey } from '@/features/startup/startupAiCards'

/**
 * AI 초안을 **레코드에 얹는다**(폼에 넣는 것이 아니라).
 *
 * 폼은 이미 원장 행 하나에서 모든 카드 값을 읽어 세운다(readBusiness·readGrowth·readIp…).
 * 그래서 초안을 폼 안쪽 상태마다 밀어 넣는 대신 **행을 한 번 합쳐** 넘기면, 폼은 자기가 늘
 * 하던 일만 하면 되고 카드가 늘어도 이 파일 하나만 는다. 폼 내부에 주입 경로를 열면 그
 * 경로가 카드 수만큼 갈라지고, 그때부터 저장 규칙이 두 곳에 살게 된다.
 *
 * ## 이 파일이 지키는 두 규칙
 *
 * 1. **보존 키** — 한 컬럼을 여러 카드가 나눠 쓰는 자리가 둘 있다. `business_profile`은
 *    비즈니스 카드와 요약 3축(강점·보완점·필요사항)이, `growth_metrics`는 실적 카드 넷이
 *    나눠 쓴다. 체크된 카드의 키만 갈아 끼우고 나머지 키는 원본 값을 그대로 옮긴다.
 *    빠뜨리면 트랙션만 체크했는데 매출 표가 사라진다.
 * 2. **AI의 null은 지우지 않는다** — 근거를 못 찾은 칸은 기존 값을 그대로 둔다. "모른다"를
 *    "없다"로 바꾸는 것은 사람만 할 수 있는 판단이고, 비우는 일에는 되돌릴 근거가 없다.
 *
 * 근거: docs/docs_planning/3_3_5_startup_ai_fill.md §4.5·§5.1
 */

/** Edge Function 응답 봉투. cards의 값 모양은 카드마다 다르므로 unknown으로 받고 여기서 읽는다. */
export interface AiFillEnvelope {
  cards: Partial<Record<AiCardKey, unknown>>
  notes: Partial<Record<AiCardKey, string[]>>
  evidence: Partial<Record<AiCardKey, string[]>>
}

/** 실행 결과 요약 — 폼 상단 안내 줄이 읽는다. */
export interface AiFillOutcome {
  /** 실제로 값이 채워진 카드. */
  filled: AiCardKey[]
  /** 체크했으나 자료에 근거가 없어 비워 둔 카드(기존 값 유지). */
  skipped: AiCardKey[]
  notes: Partial<Record<AiCardKey, string[]>>
  evidence: Partial<Record<AiCardKey, string[]>>
}

type Rec = Record<string, unknown>

const obj = (v: unknown): Rec => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Rec) : {})
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])

/** 초안 값이 있으면 그것, 없으면(null·빈 문자열) 기존 값. 지우지 않는다는 규칙의 구현. */
function keep(next: unknown, prev: unknown): unknown {
  if (next == null) return prev
  if (typeof next === 'string' && next.trim() === '') return prev
  return next
}

/** 객체 카드: 지정한 키만 얹는다. 목록에 없는 키(요약 3축 등)는 손대지 않는다. */
function mergeKeys(prev: Rec, next: Rec, keys: string[]): Rec {
  const out: Rec = { ...prev }
  for (const k of keys) out[k] = keep(next[k], prev[k])
  return out
}

/** 목록 카드: 비어 있으면 기존 목록을 그대로 둔다(빈 배열은 '없다'가 아니라 '못 찾았다'다). */
function mergeList(prev: unknown, next: unknown): unknown[] {
  const list = arr(next)
  return list.length > 0 ? list : arr(prev)
}

/** 카드가 실제로 무언가를 채웠는가 — 요약 줄의 '채운 카드/못 찾은 카드'를 가른다. */
function hasContent(value: unknown): boolean {
  if (value == null) return false
  if (Array.isArray(value)) return value.length > 0
  return Object.values(obj(value)).some((v) =>
    Array.isArray(v) ? v.length > 0 : v != null && String(v).trim() !== '',
  )
}

const BUSINESS_KEYS = ['oneLiner', 'businessModel', 'targetMarket', 'revenueModel', 'salesChannel', 'supplyMode']
const TECH_KEYS = ['product', 'devStage', 'coreTech', 'devInsourcing', 'differentiator']
const TEAM_TEXT_KEYS = ['founderStrength', 'orgComposition', 'hiringPlan']

/** 팀 카드: 텍스트 3칸은 키 단위로, 목록 3종은 목록 규칙으로 얹는다. */
function mergeTeam(prev: Rec, next: Rec): Rec {
  const merged = mergeKeys(prev, next, TEAM_TEXT_KEYS)
  merged.members = mergeList(prev.members, next.members)
  merged.advisors = mergeList(prev.advisors, next.advisors)
  merged.capabilities = mergeList(prev.capabilities, next.capabilities)
  return merged
}

/** 성장 지표 컬럼에 목록 하나만 갈아 끼운다. 나머지 다섯은 원본 그대로 넘어간다. */
function putGrowth(growth: Rec, key: string, next: unknown): Rec {
  return { ...growth, [key]: mergeList(growth[key], next) }
}

/**
 * 체크된 카드만 레코드에 얹은 새 행을 만든다. 원본은 그대로 두므로(취소하면 원래 값이다)
 * 화면은 이 결과를 폼의 `initial`로 넘기기만 하면 된다.
 */
export function applyAiDraft(
  record: EntityRow,
  envelope: AiFillEnvelope,
  cards: AiCardKey[],
): { record: EntityRow; outcome: AiFillOutcome } {
  const next: EntityRow = { ...record }
  // 컬럼을 나눠 쓰는 두 자리는 누적해 고친다 — 카드마다 원본에서 새로 읽으면 앞 카드의 결과가 지워진다.
  let business = obj(record.business_profile)
  let growth = obj(record.growth_metrics)

  const filled: AiCardKey[] = []
  const skipped: AiCardKey[] = []

  for (const key of cards) {
    const value = envelope.cards[key]
    if (!hasContent(value)) {
      skipped.push(key)
      continue
    }
    filled.push(key)
    switch (key) {
      case 'business':
        business = mergeKeys(business, obj(value), BUSINESS_KEYS)
        break
      case 'tech':
        next.tech_profile = mergeKeys(obj(record.tech_profile), obj(value), TECH_KEYS)
        break
      case 'team':
        next.team_profile = mergeTeam(obj(record.team_profile), obj(value))
        break
      case 'ip': {
        const prev = obj(record.ip_profile)
        const v = obj(value)
        next.ip_profile = {
          rights: mergeList(prev.rights, v.rights),
          certifications: mergeList(prev.certifications, v.certifications),
          govProjects: mergeList(prev.govProjects, v.govProjects),
        }
        break
      }
      case 'timeline':
        next.business_status = mergeList(record.business_status, value)
        break
      case 'traction': {
        const v = obj(value)
        growth = putGrowth(putGrowth(growth, 'traction', v.traction), 'customers', v.customers)
        break
      }
      case 'revenue': {
        const v = obj(value)
        growth = putGrowth(putGrowth(growth, 'revenue', v.revenue), 'finance', v.finance)
        break
      }
      case 'employee':
        growth = putGrowth(growth, 'employee', value)
        break
      case 'investment':
        growth = putGrowth(growth, 'investment', value)
        break
      case 'shareholders':
        next.shareholders = mergeList(record.shareholders, value)
        break
    }
  }

  next.business_profile = business
  next.growth_metrics = growth
  return { record: next, outcome: { filled, skipped, notes: envelope.notes, evidence: envelope.evidence } }
}

/** 요약 줄 문구 — 무엇이 채워졌고 무엇이 그대로인지 한 줄로 말한다. */
export function outcomeSummary(outcome: AiFillOutcome): string {
  const filled = outcome.filled.map((k) => AI_CARD_LABEL[k]).join(' · ')
  const head = outcome.filled.length > 0
    ? `AI가 ${outcome.filled.length}개 카드를 채웠습니다: ${filled}.`
    : 'AI가 채운 카드가 없습니다.'
  if (outcome.skipped.length === 0) return `${head} 확인 후 저장하세요.`
  const skipped = outcome.skipped.map((k) => AI_CARD_LABEL[k]).join(' · ')
  return `${head} 자료에서 찾지 못해 그대로 둔 카드: ${skipped}. 확인 후 저장하세요.`
}
