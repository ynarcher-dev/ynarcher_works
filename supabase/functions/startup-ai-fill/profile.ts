// [STARTUP AI 작성하기] 이 대상의 규격 — **무엇을 뽑는가**만 여기 있다.
//
// 자료를 모으고, 예산을 재고, 요청을 나누고, 모델을 부르고, 근거를 대조하는 일은 전부 엔진이
// 한다(`_shared/aiFill`). 이 파일이 답하는 것은 넷뿐이다 — 어떤 카드를 어떤 규격으로 뽑는가,
// 어떤 프롬프트로 지시하는가, 누가 고칠 수 있는가, 감사 기록에 뭐라 적는가.
//
// 다른 대상(전문가 원장·사업 등)에 같은 기능을 붙일 때 새로 쓰는 것이 이만큼이다.
//
// 근거: docs/docs_planning/3_3_5_startup_ai_fill.md §16.16

import type { AiFillProfile, CallerClient } from '../_shared/aiFill/profile.ts'
import type { Warn } from '../_shared/aiFill/envelope.ts'
import { CARD_KEYS, CARD_LABELS, CARD_SHAPE, isCardKey, LIMITS, type CardKey } from './cards.ts'
import { CARD_SCHEMAS } from './schema.ts'
import { buildPrompt } from './prompts.ts'
import { normalizeCard } from './validate.ts'

/**
 * 이 대상의 요청 시점 맥락.
 *
 * 소재지 선택지는 ADMIN 원장이 소유한다. 상수로 적어 두면 원장에서 시·도가 바뀌는 날 서버만
 * 옛 목록으로 판정하므로, 그 카드를 고른 요청에서만 그때그때 받아 온다.
 */
export interface StartupContext {
  locations: string[]
}

/**
 * 같은 자료를 읽더라도 한 요청에 함께 맡길 수 있는 카드 묶음.
 *
 * 서로 맞물리는 카드(매출·고용·주주·투자)는 한 축에 남긴다 — 지분율과 투자 라운드는 같은
 * 표에서 함께 읽히는 값이라 갈라 물으면 양쪽이 서로 다른 표를 집는다.
 */
const EXTRACTION_FAMILY: Record<CardKey, 'overview' | 'organization' | 'growth' | 'capital'> = {
  basics: 'overview',
  summary: 'overview',
  business: 'overview',
  tech: 'overview',
  team: 'organization',
  ip: 'organization',
  timeline: 'growth',
  traction: 'growth',
  revenue: 'capital',
  employee: 'capital',
  shareholders: 'capital',
  investment: 'capital',
}

/**
 * 카드마다 그 값이 있을 법한 자리를 가리키는 낱말.
 *
 * **예산을 넘겨 조각을 골라야 할 때만 쓴다.** 예산 안에서는 조각 전부가 실리므로 이 목록이
 * 회수에 영향을 주지 않는다 — 빠짐없이 뽑는 것이 이 기능의 계약이고, 고르는 일은 버리는 것을
 * 줄이는 수단일 뿐이다. 그래서 낱말이 부실해도 초안이 나빠지지 않는다(정렬만 덜 똑똑해진다).
 *
 * 표의 머리글에 실제로 쓰이는 말을 담는다 — 조각의 자리 표시(`시트: 손익계산서`)가 함께
 * 검색되므로, 시트명 하나가 그 시트 전체를 앞으로 끌어올린다.
 */
const CARD_KEYWORDS: Partial<Record<CardKey, readonly string[]>> = {
  basics: ['법인등록', '사업자등록', '설립', '대표이사', '본점', '소재지'],
  business: ['비즈니스 모델', '수익 모델', 'target', '고객', '시장', '판매'],
  tech: ['기술', '제품', '개발', '특허', 'r&d', '스펙'],
  team: ['조직', '팀', '인력', '이력', '경력', '자문'],
  ip: ['특허', '상표', '인증', '출원', '등록번호', '정부과제', '지원사업'],
  timeline: ['연혁', '주요 이력', 'history', '설립', '수상'],
  traction: ['mau', 'dau', 'gmv', '거래액', '가입자', '계약', 'mou', 'poc'],
  revenue: ['매출', '손익', '영업이익', '당기순', '재무상태', '자산', '부채', '자본'],
  employee: ['고용', '임직원', '인원', '직원 수'],
  shareholders: ['주주', '지분', '주식', '보통주', '우선주', '지분율'],
  investment: ['투자', '유치', '시리즈', '라운드', '밸류', '기업가치', 'pre-a'],
}

export const startupProfile: AiFillProfile<CardKey, StartupContext> = {
  name: 'startup',
  /** 첨부 대상 다형 키(스타트업 자료는 한 곳에 모인다 — StartupDetailForm의 MATERIAL_TARGET_TYPE). */
  targetType: 'startup',
  legacyIdKey: 'startupId',

  cardKeys: CARD_KEYS,
  cardLabels: CARD_LABELS,
  cardShape: CARD_SHAPE,
  family: EXTRACTION_FAMILY,
  cardSchemas: CARD_SCHEMAS,
  cardKeywords: CARD_KEYWORDS,
  maxNotes: LIMITS.notes,

  async loadContext(caller, cards) {
    if (!cards.includes('basics')) return { locations: [] }
    const { data } = await caller.from('location_tags').select('name').is('deleted_at', null).order('sort_order')
    return { locations: (data ?? []).map((t) => String(t.name)).filter(Boolean) }
  },

  buildPrompt(cards, subject, context) {
    return buildPrompt(cards, subject, context.locations)
  },

  normalizeCard(key: CardKey, raw: unknown, warn: Warn<CardKey>, context: StartupContext) {
    return normalizeCard(key, raw, warn, context.locations)
  },

  // 두 판정식 모두 정책에서 꺼낸 것이라 여기에 복제본이 없다. 복제하면 정책이 바뀌는 날
  // 함수는 옛 규칙으로 답하고, 어긋난 것을 알려 주는 것이 없다.
  async canWrite(caller: CallerClient, targetId: string) {
    const { data, error } = await caller.rpc('can_write_startup', { p_id: targetId })
    if (error) {
      console.error('[startup-ai-fill] 권한 판정 실패', error.message)
      return false
    }
    return data === true
  },

  async canCreate(caller: CallerClient) {
    const { data, error } = await caller.rpc('can_create_startup')
    if (error) {
      console.error('[startup-ai-fill] 등록 권한 판정 실패', error.message)
      return false
    }
    return data === true
  },

  async subjectName(caller: CallerClient, targetId: string) {
    const { data } = await caller.from('startups').select('name').eq('id', targetId).maybeSingle()
    return data?.name ? String(data.name) : ''
  },

  audit: { stored: 'attachment_ai_read', draft: 'startup_draft_ai_read' },

  messages: {
    forbiddenWrite: '이 기업의 정보를 수정할 권한이 없습니다.',
    forbiddenCreate: '스타트업을 등록할 권한이 없습니다.',
  },
}

export { isCardKey }
