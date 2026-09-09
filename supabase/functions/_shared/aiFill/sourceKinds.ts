// [AI 작성하기] 자료 종류의 꼬리표 — 모델이 자료를 **무게**로 가릴 수 있게 한다.
//
// 격자를 걷은 뒤(2026-09-09) 모든 카드가 같은 자료 한 벌을 읽는다. 그러면 재무 카드에 IR 자료가
// 함께 들어가 확정 재무 대신 목표 수치를 집어 오는 일을 막을 자리가 없어 보이지만, 그 방어는
// 자료를 빼는 것이 아니라 **자료가 무엇인지 말해 주는 것**으로도 선다 — 파일명이 이미 답하고
// 있는 종류를 꼬리표로 붙이면 모델은 "확정 숫자는 재무제표에서, 서술은 IR에서"를 가릴 수 있다.
//
// 판정(`classifySourceKind`)은 화면과 같은 파일을 쓴다(`_shared/docParse/sourceKind.ts`).
// 화면이 상 칸에 세운 꼬리표와 모델이 읽는 꼬리표가 어긋나면 담당자가 본 것과 모델이 읽은 것이
// 다른 자료가 된다.
//
// Deno API를 쓰지 않는다(works vitest가 이 판정을 직접 돌린다).
// 근거: docs/docs_planning/3_3_7_ai_fill_visual_read.md §5

import { SOURCE_KIND_LABELS, type SourceKind } from '../docParse/sourceKind.ts'
import type { SourceRef } from './chunks.ts'

/** 자료 머리글 — `[자료 s2 · 재무제표: 2025_FS.pdf]`. 기타는 종류를 적지 않는다(아무 말도 아니다). */
export function sourceHeader(ref: Pick<SourceRef, 'id' | 'name' | 'kind'>): string {
  const label = ref.kind === 'other' ? '' : ` · ${SOURCE_KIND_LABELS[ref.kind]}`
  return `[자료 ${ref.id}${label}: ${ref.name}]`
}

/** 확정 숫자의 우선순위. 앞이 이긴다 — 프롬프트 규칙이 이 순서를 그대로 말한다. */
const PRIORITY: readonly SourceKind[] = ['audit', 'financial', 'pnl', 'registry', 'shareholders', 'cert', 'plan', 'ir', 'intro']

/**
 * 모델에게 꼬리표의 뜻을 말하는 공통 규칙. 프로파일의 상충 규칙 뒤에 덧붙는다.
 *
 * 프로파일마다 적지 않는 이유는 꼬리표를 붙이는 쪽이 엔진이기 때문이다 — 규약이 두 곳에 살면
 * 라벨 하나를 고친 날 한쪽만 옛 이름으로 말한다.
 */
export const SOURCE_KIND_RULES = `자료 종류 규칙:
- 자료 머리글의 가운뎃점 뒤(예: [자료 s2 · 재무제표: ...])는 파일명으로 판정한 **자료 종류**입니다. 종류가 없는 자료는 기타입니다.
- 확정 수치(매출·이익·자산·부채·자본·지분율·설립일·등록번호)는 ${PRIORITY.map((k) => SOURCE_KIND_LABELS[k]).join(' > ')} 순으로 우선합니다.
  IR 자료·회사소개서의 숫자는 그보다 앞선 종류의 자료에 같은 항목이 없을 때만 씁니다.
- 서술 항목(비즈니스·제품·팀·강점)은 IR 자료·사업계획서·회사소개서를 주로 읽되, 그 안의 목표·전망 수치를 실적으로 옮기지 않습니다.
- 종류가 파일 내용과 어긋나면(파일명은 재무제표인데 내용이 소개 자료) 내용을 따르고 notes에 그 사실을 남깁니다.`
