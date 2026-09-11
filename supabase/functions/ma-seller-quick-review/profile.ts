// [M&A 셀러 퀵 리뷰] 이 대상의 규격 — **무엇을 뽑는가**만 여기 있다.
//
// 자료를 모으고, 예산을 재고, 요청을 나누고, 모델을 부르고, 근거를 대조하는 일은 전부 엔진이
// 한다(`_shared/aiFill`). 이 파일이 답하는 것은 넷뿐이다 — 어떤 절을 어떤 규격으로 뽑는가,
// 어떤 프롬프트로 지시하는가, 누가 고칠 수 있는가, 감사 기록에 뭐라 적는가.
//
// STARTUP 프로파일 다음으로 이 엔진을 쓰는 두 번째 대상이며, 새로 쓴 것이 이만큼이다.
//
// 근거: docs/docs_planning/3_6_1_ma_seller_quick_review.md

import type { AiFillProfile, CallerClient, ContextTarget } from '../_shared/aiFill/profile.ts'
import type { Warn } from '../_shared/aiFill/envelope.ts'
import { CARD_KEYS, CARD_LABELS, CARD_SHAPE, isCardKey, LIMITS, type CardKey } from './cards.ts'
import { CARD_SCHEMAS } from './schema.ts'
import { buildPrompt } from './prompts.ts'
import { quickReviewCompose } from './compose.ts'
import { crossCheckCards } from './crossCheck.ts'
import { loadLedgerFacts, type LedgerFacts } from './ledger.ts'
import { normalizeCard } from './validate.ts'

/**
 * 이 대상의 요청 시점 맥락 — **연결한 스타트업의 확정 값 하나**다.
 *
 * 고정 선택지는 여전히 없다(퀵 리뷰의 절은 전부 문서에서 읽은 그대로를 적는 자리이고, STARTUP이
 * 소재지 목록을 원장에서 받아 오는 것과는 사정이 다르다). 2026-09-11에 이 칸이 생긴 것은 선택지
 * 때문이 아니라 **이미 확인된 사실** 때문이다 — 셀러가 가리키는 기업의 매출·주주·대표자는 담당자가
 * 이미 확정해 저장한 값인데, 종전에는 그 값을 두고 값의 출처인 PDF를 다시 읽어 같은 값을 다시
 * 뽑았다(ledger.ts).
 */
export interface QuickReviewContext {
  /** 연결이 없거나 볼 수 없거나 원장이 비어 있으면 null — 그때는 종전처럼 자료만으로 뽑는다. */
  ledger: LedgerFacts | null
}

/**
 * 같은 자료를 읽더라도 한 요청에 함께 맡길 수 있는 절 묶음.
 *
 * 나누는 목적은 입력을 줄이는 것이 **아니다** — 자료는 그대로이고 요청당 출력이 작아져 답이
 * 잘리지 않는 것이 목적이다(groups.ts 주석).
 *
 * **재무와 투자 포인트를 각자 떼어 둔 것**이 요점이다. 재무는 두 표 열 몇 줄이라 출력이 가장
 * 길고, 투자 포인트는 앞 절 전부를 근거로 삼는 서술이라 함께 물으면 둘 중 하나가 잘린다.
 * 서로 맞물리는 것끼리는 한 축에 남긴다 — 한줄 요약·주요내용·회사 소개는 같은 앞머리를 읽고,
 * Valuation은 재무 표의 숫자를 그대로 쓴다.
 */
const EXTRACTION_FAMILY: Record<CardKey, 'overview' | 'product' | 'financial' | 'thesis'> = {
  summary: 'overview',
  basics: 'overview',
  intro: 'overview',
  products: 'product',
  financials: 'financial',
  valuation: 'financial',
  highlights: 'thesis',
}

/**
 * 절마다 그 값이 있을 법한 자리를 가리키는 낱말.
 *
 * **예산을 넘겨 조각을 골라야 할 때만 쓴다.** 예산 안에서는 조각 전부가 실리므로 이 목록이
 * 회수에 영향을 주지 않는다 — 빠짐없이 뽑는 것이 이 기능의 계약이고, 고르는 일은 버리는 것을
 * 줄이는 수단일 뿐이다. 그래서 낱말이 부실해도 초안이 나빠지지 않는다(정렬만 덜 똑똑해진다).
 *
 * 표의 머리글에 실제로 쓰이는 말을 담는다 — 조각의 자리 표시(`시트: 손익계산서`)가 함께
 * 검색되므로, 시트명 하나가 그 시트 전체를 앞으로 끌어올린다.
 */
const CARD_KEYWORDS: Partial<Record<CardKey, readonly string[]>> = {
  summary: ['개요', 'summary', '요약', '한줄'],
  basics: ['설립', '대표이사', '본점', '소재지', '주주', '지분', '법인등기', '사업내용'],
  intro: ['회사 소개', '개요', '점유율', '유통', '채널', '고객사', '연혁'],
  products: ['제품', '브랜드', '라인업', 'sku', '판매량', '서비스'],
  financials: ['손익', '매출', '영업이익', 'ebitda', '재무상태', '자산', '부채', '자본', '현금', '차입'],
  valuation: ['valuation', '밸류', '기업가치', 'ev', 'multiple', '배수', '거래가'],
  highlights: ['투자 포인트', 'highlight', '강점', '경쟁력', '성장', '시장', '규제'],
}

export const maSellerQuickReviewProfile: AiFillProfile<CardKey, QuickReviewContext> = {
  name: 'ma-seller-quick-review',
  /** 첨부의 다형 대상 키. 셀러 자료는 한 곳에 모인다(MaPartyConfig.targetType). */
  targetType: 'ma_seller',

  cardKeys: CARD_KEYS,
  cardLabels: CARD_LABELS,
  cardShape: CARD_SHAPE,
  family: EXTRACTION_FAMILY,
  cardSchemas: CARD_SCHEMAS,
  cardKeywords: CARD_KEYWORDS,
  maxNotes: LIMITS.notes,

  // 조회는 호출자 토큰으로 돈다 — 그 기업을 볼 수 없는 사람에게는 null이 오고, 프롬프트에
  // 확정 사실 칸이 서지 않는다(권한을 한 뼘도 넓히지 않는다).
  async loadContext(caller: CallerClient, _cards, target: ContextTarget) {
    return { ledger: await loadLedgerFacts(caller, target) }
  },

  buildPrompt(cards, subject, context) {
    return buildPrompt(cards, subject, context.ledger)
  },

  normalizeCard(key: CardKey, raw: unknown, warn: Warn<CardKey>) {
    return normalizeCard(key, raw, warn)
  },

  crossCheck(cards, warn) {
    crossCheckCards(cards, warn)
  },

  /**
   * 2단계 작문 패스를 켠다 — **이 대상이 원장의 칸이 아니라 읽히는 문서이기 때문**이다.
   *
   * STARTUP 프로파일에는 이 값이 없다. 저쪽에서 뽑는 것은 상세페이지 카드의 칸이라 1단계의
   * 명사구가 그대로 최종본이고, 문장으로 세울 자리가 없다.
   */
  compose: quickReviewCompose,

  // 두 판정 모두 정책이 쓰는 식을 되묻는다 — 복제하면 정책이 바뀌는 날 함수는 옛 규칙으로
  // 답하고, 어긋난 것을 알려 주는 것이 없다(마이그레이션 20260907230000).
  async canWrite(caller: CallerClient, targetId: string) {
    const { data, error } = await caller.rpc('can_write_ma_seller', { p_id: targetId })
    if (error) {
      console.error('[ma-seller-quick-review] 권한 판정 실패', error.message)
      return false
    }
    return data === true
  },

  async canCreate(caller: CallerClient) {
    const { data, error } = await caller.rpc('can_create_ma_seller')
    if (error) {
      console.error('[ma-seller-quick-review] 등록 권한 판정 실패', error.message)
      return false
    }
    return data === true
  },

  async subjectName(caller: CallerClient, targetId: string) {
    const { data } = await caller.from('ma_sellers').select('name').eq('id', targetId).maybeSingle()
    return data?.name ? String(data.name) : ''
  },

  audit: { stored: 'attachment_ai_read', draft: 'ma_seller_draft_ai_read' },

  messages: {
    forbiddenWrite: '이 셀러의 정보를 수정할 권한이 없습니다.',
    forbiddenCreate: '셀러를 등록할 권한이 없습니다.',
  },
}

export { isCardKey }
