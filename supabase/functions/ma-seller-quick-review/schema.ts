// [M&A 셀러 퀵 리뷰] Gemini 구조화 출력 스키마(responseSchema) 조립.
//
// 스키마를 프롬프트와 같은 폴더에 두되 파일을 나눈 이유는 둘이 서로 다른 것을 강제하기
// 때문이다 — 프롬프트는 **무엇을 적을지**를, 스키마는 **어떤 모양으로 올지**를 정한다.
// 모양이 어긋나면 파싱 단계에서 통째로 실패하므로 스키마는 최대한 느슨하게 잡고
// (거의 모든 칸이 nullable), 값의 옳고 그름은 validate.ts가 뒤에서 따로 거른다.
//
// **파생값 칸을 두지 않는다.** 성장률·이익률·Net debt는 이 표의 값으로 계산되는 것이라
// 모델에게 물으면 두 벌의 숫자가 생기고, 그중 어느 쪽이 사실인지 판정할 근거가 없다.
// 화면이 계산해 세운다(원장에도 담지 않는다 — 마이그레이션 20260907230000 참조).
//
// **요약재무 칸도 두지 않는다.** 문서의 '주요내용'에 선 자산·부채·자본·매출은 재무 절의
// 가장 최근 회계연도와 같은 숫자다. 두 번 물으면 두 답이 어긋날 수 있고, 어긋났을 때 어느
// 쪽이 문서의 사실인지 답할 자리가 없다.
//
// **봉투(notes·evidence)는 여기 없다.** 그것은 대상이 무엇이든 같은 일을 하므로 엔진이
// 소유한다(_shared/aiFill/schema.ts) — 특히 evidence는 우리가 발급한 조각 id로 답해야 해서
// 프로파일이 모양을 정할 자리가 아니다.
//
// 근거: docs/docs_planning/3_6_1_ma_seller_quick_review.md

import { arr, NUM, obj, STR, type SchemaNode } from '../_shared/aiFill/schema.ts'
import type { CardKey } from './cards.ts'

/**
 * 손익 한 해. 담는 것은 **문서에 인쇄된 절대값뿐**이고 비율은 전부 화면이 계산한다.
 *
 * 단위는 백만원 하나다 — 문서가 억으로 읽히는 자리가 있어도 저장은 한 단위여야, 두 표를
 * 나란히 놓았을 때 같은 자리의 숫자가 같은 뜻을 갖는다.
 */
const PNL_YEAR = obj({
  fiscalYear: NUM,
  netRevenue: NUM,
  grossProfit: NUM,
  ebitda: NUM,
  ebit: NUM,
  adjustedEbitda: NUM,
})

/**
 * 재무상태표 한 해.
 *
 * `netDebt`를 받지 않는다 — 문서 자신이 '이자부채 − 현금'이라 정의를 적어 두는 값이라,
 * 계산식이 이미 화면에 있는데 결과까지 저장하면 둘이 어긋날 자리만 생긴다.
 */
const BS_YEAR = obj({
  fiscalYear: NUM,
  cash: NUM,
  interestBearingDebt: NUM,
  unpaidTax: NUM,
  totalAssets: NUM,
  totalLiabilities: NUM,
  totalEquity: NUM,
})

export const CARD_SCHEMAS: Record<CardKey, SchemaNode> = {
  // 한 줄이지만 객체로 받는다 — 절의 모양이 절마다 다르면 병합이 절 이름마다 갈린다.
  summary: obj({ headline: STR }),

  basics: obj({
    companyName: STR,
    foundedOn: STR,
    headquarters: STR,
    representative: STR,
    businessDescription: STR,
    // 지분율은 퍼센트 숫자로 받는다(문자열 '53.5%'가 오면 정규화가 숫자만 남긴다).
    shareholders: arr(obj({ name: { type: 'STRING' }, ratio: NUM })),
    /** 주주구성의 기준 시점('딜 전, 26.5월 말' 같은 단서). 이 값이 없으면 지분율은 시점 없는 숫자다. */
    shareholdersAsOf: STR,
    note: STR,
  }),

  intro: obj({
    // 문서가 한 줄에 네 칸으로 세우는 지표 타일. 라벨과 값이 짝이라 표가 아니라 목록이다.
    metrics: arr(obj({ label: { type: 'STRING' }, value: { type: 'STRING' } })),
    body: STR,
    bullets: arr({ type: 'STRING' }),
  }),

  products: obj({
    body: STR,
    note: STR,
    items: arr(obj({ product: { type: 'STRING' }, achievement: STR })),
    bullets: arr({ type: 'STRING' }),
  }),

  financials: obj({
    pnl: arr(PNL_YEAR),
    bs: arr(BS_YEAR),
    note: STR,
  }),

  valuation: obj({ bullets: arr({ type: 'STRING' }) }),

  // 유일한 목록 절 — ①~⑤가 각자 제목과 근거 줄을 갖는다.
  highlights: arr(obj({ title: { type: 'STRING' }, bullets: arr({ type: 'STRING' }) })),
}
