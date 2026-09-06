// [AI 작성하기] 모델 응답 봉투의 정규화 — 카드 안쪽은 프로파일에 맡기고 바깥만 여기서 거른다.
//
// 모델 응답을 신뢰하지 않는 이유는 악의가 아니라 성질이다. 스키마는 모양만 강제하고 값의
// 옳고 그름은 말하지 않으므로, 규격 밖의 값·형식이 어긋난 날짜·이름 없는 행이 모양만 맞은
// 채로 온다. 거르는 방식은 하나로 통일한다 — **버리되 흔적을 남긴다.**
//
// 봉투에서 엔진이 책임지는 것은 셋이다.
//   * 요청하지 않은 카드를 버린다(체크 해제는 '안 씀'이 아니라 '건드리지 않음'이다).
//   * 빈 카드를 null/[]로 되돌린다(화면이 "기존 값 유지"로 읽는 모양).
//   * notes를 다듬고 evidence를 **원문과 대조한다**.
//
// Deno API를 쓰지 않는다(works vitest가 이 판정을 직접 돌린다).
// 근거: docs/docs_planning/3_3_5_startup_ai_fill.md §8.2·§16.15

import type { ChunkIndex } from './chunks.ts'
import { rejectedNote, verifyEvidence, type Evidence, type EvidenceStats } from './evidence.ts'

type Rec = Record<string, unknown>

/** 모델이 돌려준 초안 봉투(카드 키별 값·경고·검증된 근거). */
export interface DraftEnvelope<K extends string = string> {
  cards: Partial<Record<K, unknown>>
  notes: Partial<Record<K, string[]>>
  evidence: Partial<Record<K, Evidence[]>>
}

/** 정규화 중 쌓이는 경고. 카드별 notes 뒤에 덧붙는다. */
export type Warn<K extends string> = (card: K, line: string) => void

export interface NormalizeDeps<K extends string> {
  /** 카드 한 장의 값을 규격에 맞춘다. **프로파일이 소유한다** — 대상마다 다른 유일한 부분이다. */
  normalizeCard: (key: K, raw: unknown, warn: Warn<K>) => unknown
  /** 카드가 객체인지 목록인지. 빈 결과를 무엇으로 되돌릴지가 여기서 갈린다. */
  cardShape: Record<K, 'object' | 'array'>
  /** 이번 요청이 실어 보낸 조각 지도. 근거는 이 지도에 있는 것만 인정된다. */
  index: ChunkIndex
  /** 카드마다 notes 줄 수 상한. */
  maxNotes: number
}

const rec = (v: unknown): Rec => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Rec) : {})
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])

/**
 * 카드가 실질적으로 비었는가.
 *
 * 값 없는 키만 가득한 객체를 그대로 내보내면 화면은 그것을 '채워진 카드'로 세고, 담당자는
 * 무엇이 바뀌었는지 알 수 없다.
 */
function isEmptyCard(value: unknown): boolean {
  if (value == null) return true
  if (Array.isArray(value)) return value.length === 0
  return Object.values(value as Rec).every((v) => v == null || v === '' || (Array.isArray(v) && v.length === 0))
}

/** notes 한 카드분: 줄 수·길이 상한을 서버가 다시 강제한다. */
function normLines(v: unknown, max: number): string[] {
  return list(v)
    .map((s) => (typeof s === 'string' && s.trim() ? s.trim().slice(0, 80) : null))
    .filter((s): s is string => Boolean(s))
    .slice(0, max)
}

/** 봉투 정규화의 부산물. 로그에만 쓴다(자료 내용은 담기지 않는다). */
export interface EnvelopeStats extends EvidenceStats {}

/**
 * 모델 응답 전체를 요청한 카드 기준으로 정규화한다.
 *
 * 요청하지 않은 카드가 섞여 오면 버린다 — 담당자가 지키기로 한 카드를 모델이 채워 보낸 것을
 * 화면까지 흘려 보내지 않는다.
 */
export function normalizeEnvelope<K extends string>(
  parsed: unknown,
  requested: K[],
  deps: NormalizeDeps<K>,
): { envelope: DraftEnvelope<K>; stats: EnvelopeStats } {
  const root = rec(parsed)
  const rawCards = rec(root.cards)
  const rawNotes = rec(root.notes)
  const rawEvidence = rec(root.evidence)

  const extra: Partial<Record<K, string[]>> = {}
  const warn: Warn<K> = (card, line) => {
    ;(extra[card] ??= []).push(line)
  }

  const cards: Partial<Record<K, unknown>> = {}
  const notes: Partial<Record<K, string[]>> = {}
  const evidence: Partial<Record<K, Evidence[]>> = {}
  const stats: EnvelopeStats = { verified: 0, unverified: 0, rejected: 0 }

  for (const key of requested) {
    const value = deps.normalizeCard(key, rawCards[key], warn)
    cards[key] = isEmptyCard(value) ? (deps.cardShape[key] === 'array' ? [] : null) : value

    const checked = verifyEvidence(rawEvidence[key], deps.index)
    evidence[key] = checked.evidence
    stats.verified += checked.stats.verified
    stats.unverified += checked.stats.unverified
    stats.rejected += checked.stats.rejected
    // 뗀 근거는 그 카드의 경고로 말한다 — 값은 남았는데 근거가 확인되지 않았다는 사실이
    // 담당자가 저장 전에 알아야 할 것이다.
    if (checked.stats.rejected > 0) warn(key, rejectedNote(checked.stats.rejected))
  }

  // 경고는 모델이 준 notes 뒤에 붙인다 — 앞에 두면 서버가 만든 줄이 모델의 관찰을 밀어낸다.
  for (const key of requested) {
    notes[key] = [...normLines(rawNotes[key], deps.maxNotes), ...(extra[key] ?? [])].slice(0, deps.maxNotes * 2)
  }
  return { envelope: { cards, notes, evidence }, stats }
}

/** 모델이 코드펜스로 감싼 JSON을 돌려주는 경우까지 관대하게 파싱한다. */
export function parseJson(raw: string): unknown | null {
  const cleaned = raw.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
  try {
    return JSON.parse(cleaned)
  } catch {
    return null
  }
}
