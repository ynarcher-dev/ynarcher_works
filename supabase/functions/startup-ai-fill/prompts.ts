// [AI 작성하기] 공통 규약 + 프롬프트 조립.
//
// 카드별 지시(promptCapability / promptPerformance) 앞에 늘 붙는 것이 여기 있다. 공통으로
// 올린 기준은 하나 — **카드가 늘어도 답이 달라지면 안 되는 규칙**이다. 근거 없는 값을 쓰지
// 않는 것, 표기 규격, 상충 처리는 카드마다 다시 정할 일이 아니고, 카드마다 적으면 열 벌이
// 조금씩 어긋난다.
//
// 근거: docs/docs_planning/3_3_5_startup_ai_fill.md §6

import { CARD_KEYS, CARD_LABELS, LIMITS, type CardKey } from './cards.ts'
import { BUSINESS_PROMPT, IP_PROMPT, TEAM_PROMPT, TECH_PROMPT } from './promptCapability.ts'
import {
  EMPLOYEE_PROMPT,
  INVESTMENT_PROMPT,
  REVENUE_PROMPT,
  SHAREHOLDERS_PROMPT,
  TIMELINE_PROMPT,
  TRACTION_PROMPT,
} from './promptPerformance.ts'

const CARD_PROMPTS: Record<CardKey, string> = {
  business: BUSINESS_PROMPT,
  tech: TECH_PROMPT,
  team: TEAM_PROMPT,
  ip: IP_PROMPT,
  timeline: TIMELINE_PROMPT,
  traction: TRACTION_PROMPT,
  revenue: REVENUE_PROMPT,
  employee: EMPLOYEE_PROMPT,
  shareholders: SHAREHOLDERS_PROMPT,
  investment: INVESTMENT_PROMPT,
}

/** §6.1 역할과 원칙 — 근거 없는 값을 만들지 않는다는 이 기능의 계약. */
const ROLE_RULES = `당신은 벤처캐피탈 심사역의 기업 정보 정리 보조자입니다. 첨부된 문서(사업계획서·IR 자료·재무제표 등)만을
근거로, 아래 JSON 스키마의 항목을 채웁니다.

절대 규칙:
1. 문서에 없는 사실은 쓰지 않습니다. 추정·일반론·업계 상식·문서 밖 지식을 넣지 않습니다.
2. 근거를 찾지 못한 항목은 null(목록형은 [])로 둡니다. 빈 값은 실패가 아니라 정답입니다.
3. 마케팅 수식어(혁신적·세계 최초·독보적·압도적)는 제거하고 사실만 남깁니다.
4. 여러 문서가 같은 항목에 다른 값을 말하면: 재무제표·감사보고서·등기 자료 > 사업계획서 > IR·소개 자료 순으로
   우선하고, 같은 등급이면 작성일이 늦은 문서를 택한 뒤 notes에 상충 사실을 남깁니다.
5. 전망·목표·예정·계획 값(E, 예상, 목표, ~할 것)은 실적 항목에 넣지 않습니다. 계획을 받는 칸(채용 계획 등)만
   예외입니다.
6. 출력은 지정된 JSON 하나만 냅니다. 코드펜스·설명 문장을 덧붙이지 않습니다.`

/** §6.2 표기 규격 — 핵심단어 원칙. 문장이 아니라 명사구가 이 원장의 문체다. */
const FORMAT_RULES = `서술 규격(모든 문자열 항목 공통):
- 명사구로 끝냅니다. 서술어("~합니다", "~있음", "~하고 있다")를 쓰지 않습니다.
- 한 항목 안의 여러 요소는 가운뎃점(" · ")으로 잇습니다. 문장으로 풀지 않습니다.
- 길이 상한: 짧은 칸 60자, 긴 칸 200자(줄바꿈 최대 2회). 상한은 항목별 지시가 다시 정합니다.
- 고유명사·영문 약어·제품명은 문서 원문 표기를 유지합니다(번역·풀어쓰기 금지).
- 숫자는 아라비아 숫자 + 단위. 금액은 원 단위 정수(1억 = 100000000, 1백만 = 1000000), 통화 기호·쉼표 없음.
- 날짜는 YYYY-MM. 일 단위가 필요한 칸은 YYYY-MM-DD. 월을 특정할 수 없으면 그 칸은 null.
- 비율은 % 기호 없이 숫자만(12.5). 단위 칸이 따로 있으면 그곳에 "%"를 적습니다.
- 고정 선택지 칸은 제시된 값 중 하나를 그대로 씁니다. 어느 값에도 매핑되지 않으면 null.

예 — 나쁜 표기: "중소 제조사들이 겪는 품질검사 인력 부족 문제를 AI 비전 기술로 해결하는 SaaS를 제공합니다."
예 — 좋은 표기: "중소 제조사 대상 · AI 비전 품질검사 SaaS"`

/** §6.3 봉투 — notes·evidence는 저장되지 않고 검토에만 쓰인다. */
const ENVELOPE_RULES = `출력 봉투:
- cards: 아래 지시가 있는 카드만 키로 갖습니다. 지시하지 않은 카드는 넣지 않습니다.
- notes: 카드별 문자열 목록. 문서에 있으나 규격 칸에 넣지 못한 값, 상충·확인 필요 경고를 남깁니다.
- evidence: 카드별 문자열 목록. 그 카드의 근거 위치를 "p.3 사업 개요" 형태로 남깁니다.
- notes·evidence는 카드마다 최대 ${LIMITS.notes}줄, 한 줄 80자 이내입니다.
- 카드 전체에 근거가 없으면 객체형 카드는 null, 목록형 카드는 []로 둡니다.`

/**
 * 체크된 카드의 지시만 이어 붙인다. 고르지 않은 카드의 지시를 함께 보내지 않는 이유는 비용이
 * 아니라 결과다 — 지시가 있으면 모델은 채우려 하고, 화면이 쓰지 않을 값을 만드느라 정작
 * 고른 카드의 근거 탐색이 얕아진다.
 */
export function buildPrompt(cards: CardKey[], companyName: string): string {
  // 카드 순서는 요청 순서가 아니라 화면 순서로 고정한다(역량 4 → 실적 6). 요청 순서를 그대로
  // 쓰면 같은 조합인데 담당자가 체크한 차례에 따라 프롬프트가 달라진다.
  const ordered = CARD_KEYS.filter((k) => cards.includes(k))
  const sections = ordered.map((k) => CARD_PROMPTS[k]).join('\n\n---\n\n')
  const names = ordered.map((k) => `${k}(${CARD_LABELS[k]})`).join(', ')

  return [
    ROLE_RULES,
    FORMAT_RULES,
    ENVELOPE_RULES,
    `대상 기업: ${companyName || '(문서에서 확인)'}\n채울 카드: ${names}`,
    '--- 카드별 지시 ---',
    sections,
  ].join('\n\n')
}
