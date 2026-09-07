import type { AiFillCatalog } from '@/features/ai/aiCatalog'
import type { AiFillEnvelope, AiFillOutcome, AiFailedCards } from '@/features/ai/aiTypes'
import {
  QUICK_REVIEW_KEYS,
  isSectionFilled,
  readQuickReview,
  type QuickReview,
  type QuickReviewKey,
} from '@/features/mna/parties/quickReview'

/**
 * 퀵 리뷰의 'AI 작성하기' — 카탈로그와 병합.
 *
 * 공용 AI 작성 UI(`features/ai`)에 넘길 규격이 위쪽이고, 초안을 지금 값 위에 얹는 규칙이
 * 아래쪽이다. 두 일이 한 파일에 있는 이유는 둘 다 **절 목록 하나**를 근거로 하기 때문이다 —
 * 절이 늘면 여기만 는다.
 *
 * ## 병합이 지키는 규칙 둘 (STARTUP과 같다)
 *
 * 1. **체크한 절만 갈아 끼운다** — 저장 단위가 절 하나라 나머지 키는 원본을 그대로 옮긴다.
 * 2. **AI의 null은 지우지 않는다** — 근거를 못 찾은 절은 기존 값을 그대로 둔다. "모른다"를
 *    "없다"로 바꾸는 것은 사람만 할 수 있는 판단이고, 비우는 일에는 되돌릴 근거가 없다.
 *    빈 목록도 '없다'가 아니라 '못 찾았다'로 읽는다.
 *
 * 얹는 기준이 원장이 아니라 **지금 폼에 적힌 값**인 것도 그쪽과 같다 — 편집 중에 누르는
 * 버튼이라 아직 저장하지 않은 줄이 있고, 원장을 기준으로 합치면 그 줄이 조용히 사라진다.
 *
 * 근거: docs/docs_planning/3_6_1_ma_seller_quick_review.md
 */

/** 문서 순서 그대로. 요청 순서도 이 목록이 정한다. */
const CARD_META: ReadonlyArray<{ key: QuickReviewKey; label: string; group: string }> = [
  { key: 'summary', label: '한줄 요약', group: 'overview' },
  { key: 'basics', label: '주요내용', group: 'overview' },
  { key: 'intro', label: '회사 소개', group: 'overview' },
  { key: 'products', label: '제품·서비스', group: 'product' },
  { key: 'financials', label: '재무 요약', group: 'financial' },
  { key: 'valuation', label: 'Valuation', group: 'financial' },
  { key: 'highlights', label: '투자 포인트', group: 'thesis' },
]

/** 서버의 EXTRACTION_FAMILY와 같은 키를 쓴다(profile.ts). 어긋나면 격자의 묶음 머리가 거짓이 된다. */
const CARD_GROUPS = [
  { key: 'overview', label: '개요' },
  { key: 'product', label: '제품' },
  { key: 'financial', label: '재무' },
  { key: 'thesis', label: '투자 포인트' },
]

export const QUICK_REVIEW_LABEL: Record<QuickReviewKey, string> = CARD_META.reduce(
  (acc, c) => ({ ...acc, [c.key]: c.label }),
  {} as Record<QuickReviewKey, string>,
)

/** 목록형 절의 현재 건수. 격자 열 머리가 '3건'을 말할 근거다. */
function sectionCount(qr: QuickReview, key: QuickReviewKey): number | undefined {
  switch (key) {
    case 'basics':
      return qr.basics.shareholders.length || undefined
    case 'intro':
      return qr.intro.metrics.length + qr.intro.bullets.length || undefined
    case 'products':
      return qr.products.items.length + qr.products.bullets.length || undefined
    case 'financials':
      return qr.financials.pnl.length + qr.financials.bs.length || undefined
    case 'valuation':
      return qr.valuation.bullets.length || undefined
    case 'highlights':
      return qr.highlights.length || undefined
    default:
      return undefined
  }
}

/**
 * 공용 AI 작성 UI에 넘길 이 대상의 규격.
 *
 * `filled`를 여기서 값으로 굳힌다 — 무엇이 채워졌는지는 그 값을 가진 쪽만 답할 수 있는
 * 물음이고, 기준은 저장된 행이 아니라 지금 폼에 적힌 문서다.
 */
export function quickReviewCatalog(current: QuickReview): AiFillCatalog<QuickReviewKey> {
  return {
    fillEndpoint: 'ma-seller-quick-review',
    extractEndpoint: 'ma-seller-material-extract',
    groups: CARD_GROUPS,
    cards: CARD_META.map((c) => ({
      key: c.key,
      label: c.label,
      group: c.group,
      filled: isSectionFilled(current, c.key),
      count: sectionCount(current, c.key),
    })),
    help: '매각 대상 기업의 퀵 리뷰 문서를 자료에서 만듭니다.',
  }
}

/** 값이 하나라도 들어왔는가 — '채운 절'과 '못 찾은 절'을 가른다. */
function hasContent(value: unknown): boolean {
  if (value == null) return false
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).some((v) =>
      Array.isArray(v) ? v.length > 0 : v != null && String(v).trim() !== '',
    )
  }
  return String(value).trim() !== ''
}

/**
 * 체크된 절만 지금 문서 위에 얹은 새 문서를 만든다.
 *
 * 원본은 그대로 두므로(취소하면 원래 값이다) 화면은 결과를 폼 상태에 넣기만 하면 된다.
 * 절 하나가 통째로 교체되므로 STARTUP의 '보존 키' 문제(한 컬럼을 여러 카드가 나눠 쓰는 자리)가
 * 여기에는 없다 — 절 하나에 키 하나다.
 */
export function applyQuickReviewDraft(
  current: QuickReview,
  envelope: AiFillEnvelope<QuickReviewKey>,
  cards: QuickReviewKey[],
): { review: QuickReview; outcome: AiFillOutcome<QuickReviewKey> } {
  // 지금 문서를 원본 모양(jsonb)으로 되돌려 놓고 절 단위로 갈아 끼운다 — 읽기 함수가 한 벌이라
  // 합친 결과도 같은 문을 통과하고, 그래서 AI가 보낸 값도 화면이 늘 쓰는 규격으로 정리된다.
  const merged: Record<string, unknown> = { ...(current as unknown as Record<string, unknown>) }
  const filled: QuickReviewKey[] = []
  const skipped: QuickReviewKey[] = []

  for (const key of cards) {
    // 요청이 실패한 절은 봉투에 아예 없다. 없는 키를 '못 찾았다'로 세지 않는 것이 요점이다 —
    // 그 판정은 아래 failedCards가 따로 한다.
    if (!(key in envelope.cards)) continue
    const value = envelope.cards[key]
    if (hasContent(value)) {
      merged[key] = value
      filled.push(key)
    } else {
      // 못 찾은 절은 기존 값을 그대로 둔다(빈 값으로 덮지 않는다).
      skipped.push(key)
    }
  }

  const failed: AiFailedCards<QuickReviewKey>[] = (envelope.failedCards ?? []).map((f) => ({
    keys: f.keys.filter((k): k is QuickReviewKey =>
      (QUICK_REVIEW_KEYS as readonly string[]).includes(k),
    ),
    message: f.message,
  }))

  return {
    review: readQuickReview(merged),
    outcome: {
      filled,
      skipped,
      failed,
      notes: envelope.notes,
      evidence: envelope.evidence,
      skippedSources: envelope.skippedSources ?? [],
    },
  }
}
